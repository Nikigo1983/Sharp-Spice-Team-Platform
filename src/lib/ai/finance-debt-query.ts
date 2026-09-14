/**
 * Detect Finance «должник по оплате» queries and format deterministic replies.
 */

/** Shown when Finance has no contract amount yet. */
export const NO_CONTRACT_YET_LABEL = "пока нет договора";

/** Manager asks who owes money — Finance balance, not CRM/portal status. */
export function isFinancePaymentDebtQuery(query: string): boolean {
  const lower = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!lower) return false;
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
