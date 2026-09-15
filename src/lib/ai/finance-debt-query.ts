/**
 * Detect Finance «должник по оплате» queries and format deterministic replies.
 */

import { formatRussianNamePossessiveU } from "@/lib/ai/russian-name-morphology";

/** Shown when Finance has no contract amount yet. */
export const NO_CONTRACT_YET_LABEL = "пока нет договора";

/** Pronouns that must never become client lookup terms. */
const CLIENT_PRONOUN_TOKEN_RE =
  /^(?:него|неё|нее|них|он|она|оно|его|её|ее|ему|ей|им|ими)$/iu;

export function isClientPronounToken(token: string | null | undefined): boolean {
  const t = token?.trim() ?? "";
  return Boolean(t) && CLIENT_PRONOUN_TOKEN_RE.test(t);
}

function rejectPronounName(token: string | null | undefined): string | null {
  const t = token?.trim() ?? "";
  if (!t || isClientPronounToken(t) || /^клиент/i.test(t)) return null;
  return t;
}

/**
 * Debt ask that refers to a locked client via pronoun
 * («Какой у него долг?», «Сколько она должна?»).
 */
export function isPronounDebtFollowUpQuery(query: string): boolean {
  const lower = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!lower || lower.length > 120) return false;
  // Debtor-list asks are not pronoun follow-ups.
  if (/должник/i.test(lower)) return false;
  if (/кто\s+(?:должен|должна)/i.test(lower)) return false;
  const hasDebtCue =
    /долг|баланс|оплат/i.test(lower) ||
    /сколько\s+(?:он|она)\s+(?:должен|должна)/i.test(lower) ||
    /(?:он|она)\s+(?:должен|должна)/i.test(lower);
  if (!hasDebtCue) return false;
  return (
    /(?<!\p{L})(?:у\s+)?(?:него|неё|нее|них)(?!\p{L})/u.test(lower) ||
    /(?<!\p{L})(?:он|она)(?!\p{L})/u.test(lower)
  );
}

/**
 * Debt for a named client — «какой долг у Мазуриной», not the full debtor list.
 * Pronoun-only asks are not named-client lookups.
 */
export function isFinanceNamedClientDebtQuery(query: string): boolean {
  const lower = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!lower) return false;
  if (isPronounDebtFollowUpQuery(query)) return false;
  return (
    /(?:какой|какая|какое)\s+долг\s+у\s+/i.test(lower) ||
    /долг\s+у\s+[а-яёa-z\-']/i.test(lower) ||
    /сколько\s+(?:должен|должна|должно)(?:\s|$|[.,!?])/i.test(lower) ||
    /баланс\s+(?:оплат\w*\s+)?у\s+[а-яёa-z\-']/i.test(lower) ||
    (/долг/i.test(lower) &&
      /(?<!\p{L})у\s+[А-ЯЁA-Za-zа-яё\-']{3,}/u.test(query))
  );
}

/** Surname / name token from a named debt question. */
export function extractNameFromDebtQuery(query: string): string | null {
  const afterU = query.match(
    /(?:долг|баланс|оплат\w*)\s+у\s+([А-ЯЁA-Za-zа-яё\-']{3,})/iu,
  );
  if (afterU?.[1]) return rejectPronounName(afterU[1]);

  const afterKakoy = query.match(
    /(?:какой|какая|какое)\s+долг\s+у\s+([А-ЯЁA-Za-zа-яё\-']{3,})/iu,
  );
  if (afterKakoy?.[1]) return rejectPronounName(afterKakoy[1]);

  const afterSkolko = query.match(
    /сколько\s+(?:должен|должна|должно)\s+([А-ЯЁA-Za-zа-яё\-']{3,})/iu,
  );
  if (afterSkolko?.[1]) return rejectPronounName(afterSkolko[1]);

  const bareU = query.match(/(?<!\p{L})у\s+([А-ЯЁA-Za-zа-яё\-']{3,})/iu);
  if (bareU?.[1] && /долг|баланс|оплат/i.test(query)) {
    return rejectPronounName(bareU[1]);
  }
  return null;
}

/**
 * Short follow-up after a debt answer: «А у Пермяковой?», «у Ивановой».
 * Requires recent Finance-debt context in chat history.
 */
export function isFinanceDebtFollowUpQuery(query: string): boolean {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > 80) return false;
  if (/долг|должник|баланс|оплат|email|емейл|паспорт|статус/i.test(trimmed)) {
    // Explicit debt/other topics are handled elsewhere.
    return false;
  }
  return (
    /^(?:а\s+)?у\s+[А-ЯЁA-Za-zа-яё\-']{3,}\??[.!]?$/iu.test(trimmed) ||
    /^а\s+[А-ЯЁA-Za-zа-яё\-']{3,}\??[.!]?$/iu.test(trimmed)
  );
}

export function extractNameFromDebtFollowUp(query: string): string | null {
  const trimmed = query.trim().replace(/\s+/g, " ");
  const afterU = trimmed.match(
    /^(?:а\s+)?у\s+([А-ЯЁA-Za-zа-яё\-']{3,})\??[.!]?$/iu,
  );
  if (afterU?.[1]) return afterU[1];
  const afterA = trimmed.match(/^а\s+([А-ЯЁA-Za-zа-яё\-']{3,})\??[.!]?$/iu);
  if (afterA?.[1]) return rejectPronounName(afterA[1]);
  return null;
}

export function looksLikeFinanceDebtAssistantReply(content: string): boolean {
  return (
    /Источник:\s*Finance/i.test(content) ||
    /должник(?:ов)?\s+по\s+оплате/i.test(content) ||
    /Всего с договором:/i.test(content) ||
    (/долг/i.test(content) && /Finance/i.test(content)) ||
    (/пока нет договора/i.test(content) && /Finance/i.test(content))
  );
}

export function recentHistoryHasFinanceDebtContext(
  history: Array<{ role: string; content: string }>,
  lookback = 8,
): boolean {
  const slice = history.slice(-Math.max(1, lookback));
  return slice.some((turn) => {
    if (turn.role === "assistant") {
      return looksLikeFinanceDebtAssistantReply(turn.content);
    }
    if (turn.role === "user") {
      return (
        isFinanceNamedClientDebtQuery(turn.content) ||
        isFinancePaymentDebtQuery(turn.content)
      );
    }
    return false;
  });
}

/** Resolve client name for debt lookup, including chat follow-ups. */
export function resolveFinanceDebtNameHint(
  query: string,
  history: Array<{ role: string; content: string }> = [],
): string | null {
  if (isFinanceNamedClientDebtQuery(query)) {
    return extractNameFromDebtQuery(query);
  }
  if (
    isFinanceDebtFollowUpQuery(query) &&
    recentHistoryHasFinanceDebtContext(history)
  ) {
    return extractNameFromDebtFollowUp(query);
  }
  return null;
}

/**
 * Debt / balance ask that can reuse a locked ClientRef without a new surname
 * («Какой долг?», «Сколько должна?», «Какой у него долг?», «актуальный баланс»).
 */
export function isLockedClientDebtStatusQuery(query: string): boolean {
  const lower = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!lower || lower.length > 120) return false;
  if (isFinancePaymentDebtQuery(query)) return false;
  if (isPronounDebtFollowUpQuery(query)) return true;
  return (
    /(?:какой|какая|какое)\s+долг/i.test(lower) ||
    /сколько\s+(?:должен|должна|должно)/i.test(lower) ||
    /(?:актуальн\w*\s+)?баланс(?:\s+оплат)?/i.test(lower) ||
    /долг\s+сейчас/i.test(lower) ||
    /сейчас\s+(?:какой\s+)?долг/i.test(lower)
  );
}

/** Manager asks who owes money — Finance balance, not CRM/portal status. */
export function isFinancePaymentDebtQuery(query: string): boolean {
  const lower = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!lower) return false;
  // Named client debt is handled separately — do not dump the full debtor list.
  if (isFinanceNamedClientDebtQuery(query)) return false;
  return (
    /должник/i.test(lower) ||
    /кто\s+должен(?:\s|$|[.,!?])/i.test(lower) ||
    /долг(?:и|ов)?\s+по\s+оплат/i.test(lower) ||
    /неоплаченн/i.test(lower) ||
    /не\s+оплатил/i.test(lower) ||
    /баланс\s+долг/i.test(lower) ||
    /who\s+owes/i.test(lower) ||
    /\bunpaid\b/i.test(lower) ||
    /\bdebtor/i.test(lower)
  );
}

/** Ask for emails / contacts of debtors. */
export function wantsDebtorEmails(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    /e-?mail|емейл|имейл|почт|написать|связ/i.test(lower) &&
    isFinancePaymentDebtQuery(query)
  );
}

export type FinanceDebtorRow = {
  name: string;
  email: string | null;
  balance: string | null;
  contractAmount: string | null;
  paidAmount: string | null;
};

function displayEmail(email: string | null | undefined): string {
  const trimmed = email?.trim() ?? "";
  return trimmed || "email не указан в заявке";
}

export function formatFinanceDebtorsListReply(params: {
  debtors: FinanceDebtorRow[];
  totalCases: number;
  withContract: number;
  withoutContract: number;
  /** Lead with emails (for «какие емейлы у должников»). */
  focusEmails?: boolean;
}): string {
  const {
    debtors,
    totalCases,
    withContract,
    withoutContract,
    focusEmails = false,
  } = params;

  if (withContract === 0) {
    return (
      `В Finance пока нет договоров с суммой (из ${totalCases} заявок портала Emigrant). ` +
      `Должников по оплате определить нельзя — ${NO_CONTRACT_YET_LABEL}.`
    );
  }

  if (debtors.length === 0) {
    return (
      `Должников по оплате нет: у ${withContract} клиент(ов) с договором в Finance баланс 0` +
      (withoutContract > 0
        ? `; у ${withoutContract} — ${NO_CONTRACT_YET_LABEL}.`
        : ".")
    );
  }

  const withEmail = debtors.filter((row) => Boolean(row.email?.trim())).length;

  const lines = debtors.map((row, index) => {
    const email = displayEmail(row.email);
    const balance = row.balance ?? "—";
    const contract = row.contractAmount ?? NO_CONTRACT_YET_LABEL;
    const paid = row.paidAmount ?? "0 €";
    if (focusEmails) {
      return `${index + 1}. ${row.name} — ${email} — долг ${balance}`;
    }
    return `${index + 1}. ${row.name} — ${email} — долг ${balance} (договор ${contract}, оплачено ${paid})`;
  });

  const header = focusEmails
    ? `Email должников по оплате (${debtors.length}, из них с email: ${withEmail}). Источник: Finance + Заявки портала Emigrant.`
    : `Найдено ${debtors.length} должник(ов) по оплате (Finance, баланс > 0). Источник: Finance + Заявки портала Emigrant.`;

  return [
    header,
    "",
    ...lines,
    "",
    `Всего с договором: ${withContract}. Без суммы договора: ${withoutContract}.`,
  ].join("\n");
}

export function formatFinanceClientDebtReply(params: {
  name: string;
  email: string | null;
  contractAmount: string | null;
  contractAmountCents: number | null;
  paidAmount: string | null;
  balance: string | null;
  balanceCents: number | null;
  /** Query token like «Пермяковой» — helps gender/case. */
  nameHint?: string | null;
}): string {
  const {
    name,
    email,
    contractAmount,
    contractAmountCents,
    paidAmount,
    balance,
    balanceCents,
    nameHint = null,
  } = params;
  const emailLine = email?.trim()
    ? ` Email: ${email.trim()}.`
    : " Email в заявке не указан.";
  const who = formatRussianNamePossessiveU(name, nameHint);

  if (contractAmountCents == null) {
    return (
      `${who} в Finance ${NO_CONTRACT_YET_LABEL} — долг по оплате не определён.` +
      `${emailLine} Источник: Finance + Заявки портала Emigrant.`
    );
  }

  if ((balanceCents ?? 0) <= 0) {
    return (
      `${who} долга нет: договор ${contractAmount}, оплачено ${paidAmount ?? "0 €"}, баланс 0.` +
      `${emailLine} Источник: Finance + Заявки портала Emigrant.`
    );
  }

  return (
    `${who} долг **${balance}** (договор ${contractAmount}, оплачено ${paidAmount ?? "0 €"}).` +
    `${emailLine} Источник: Finance + Заявки портала Emigrant.`
  );
}
