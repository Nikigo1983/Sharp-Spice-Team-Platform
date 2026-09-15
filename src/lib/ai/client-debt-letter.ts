/**
 * Deterministic polite debt-reminder letters for AI Workspace.
 * Avoids LLM failures on long chats when the request is a clear letter draft.
 */

import { formatRussianNamePossessiveU } from "@/lib/ai/russian-name-morphology";
import { NO_CONTRACT_YET_LABEL } from "@/lib/ai/finance-debt-query";

/** «Напиши письмо … оплатить долг» etc. */
export function isClientDebtReminderLetterQuery(query: string): boolean {
  const lower = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!lower) return false;
  const wantsLetter =
    /напиши|составь|черновик|текст|можешь\s+написать/i.test(lower) &&
    /письм|сообщен|whats?\s*app|email|мейл|емейл|клиенту/i.test(lower);
  const aboutDebt = /долг|оплат|задолж|баланс|договор/i.test(lower);
  return wantsLetter && aboutDebt;
}

/** Name token from «письмо коровяковой» / «для Ивановой». */
export function extractClientNameFromLetterQuery(query: string): string | null {
  const letterName = query.match(
    /(?:письм[оае]|сообщен\w*|текст)\s+(?:для\s+|к\s+)?([А-ЯЁA-Za-zа-яё\-']{3,})/iu,
  );
  if (letterName?.[1] && !/^(что|про|о|об|как|клиент)/i.test(letterName[1])) {
    return letterName[1];
  }

  const afterWrite = query.match(
    /(?:напиши|составь|написать).{0,48}?([А-ЯЁA-Za-zа-яё\-']{4,})\s*[,]/u,
  );
  if (afterWrite?.[1] && !/^(письм|сообщен|текст|что|про)/i.test(afterWrite[1])) {
    return afterWrite[1];
  }

  return null;
}

function greetingName(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0] ?? displayName;
  // Prefer human title-case for letter body.
  const titled =
    first.charAt(0).toLocaleUpperCase("ru-RU") +
    first.slice(1).toLocaleLowerCase("ru-RU");
  const feminine = /(?:ова|ева|ина|ына|ая|ская|цкая)$/i.test(first);
  return feminine ? `Уважаемая ${titled}!` : `Уважаемый ${titled}!`;
}

export function formatDebtReminderLetter(params: {
  displayName: string;
  email: string | null;
  contractAmount: string | null;
  contractAmountCents: number | null;
  paidAmount: string | null;
  balance: string | null;
  balanceCents: number | null;
  nameHint?: string | null;
  /** Extra manager request context (ВНЖ ending, etc.). */
  mentionResidencePermit?: boolean;
}): string {
  const {
    displayName,
    email,
    contractAmount,
    paidAmount,
    balance,
    contractAmountCents,
    balanceCents,
    nameHint = null,
    mentionResidencePermit = true,
  } = params;

  const greeting = greetingName(displayName);
  const who = formatRussianNamePossessiveU(displayName, nameHint);

  const vnzhLine = mentionResidencePermit
    ? "Ваш процесс по получению ВНЖ подходит к завершению."
    : "Мы продолжаем работу по Вашему делу.";

  let paymentBlock: string;
  if (contractAmountCents == null) {
    paymentBlock =
      `По оплате: в системе пока нет зафиксированной суммы договора (${NO_CONTRACT_YET_LABEL}). ` +
      `Пожалуйста, уточните актуальный баланс у менеджера перед отправкой.`;
  } else if ((balanceCents ?? 0) <= 0) {
    paymentBlock =
      `По договору ${contractAmount} задолженность погашена (оплачено ${paidAmount ?? "полностью"}). ` +
      `Отдельное напоминание об оплате не требуется — можно убрать этот абзац.`;
  } else {
    paymentBlock =
      `Чтобы спокойно завершить этот этап, просим погасить оставшуюся сумму по договору: **${balance}** ` +
      `(договор ${contractAmount}, уже оплачено ${paidAmount ?? "0 €"}).`;
  }

  const letter = [
    greeting,
    "",
    "Надеемся, у Вас всё хорошо.",
    "",
    vnzhLine,
    "",
    paymentBlock,
    "",
    "Если появятся вопросы по оплате или по статусу дела — мы на связи и с радостью поможем.",
    "",
    "С уважением,",
    "Команда Sharp & Spice",
  ].join("\n");

  const meta = [
    `Черновик письма ${who.replace(/\*\*/g, "")}.`,
    email?.trim() ? `Email для отправки: ${email.trim()}.` : "Email в заявке не указан.",
    "Источник сумм: Finance + Заявки портала Emigrant.",
  ].join(" ");

  return `${meta}\n\n---\n\n${letter}`;
}
