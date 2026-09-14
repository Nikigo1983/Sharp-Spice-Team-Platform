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

export type FinanceDebtorRow = {
  name: string;
  balance: string | null;
  contractAmount: string | null;
  paidAmount: string | null;
};

export function formatFinanceDebtorsListReply(params: {
  debtors: FinanceDebtorRow[];
  totalCases: number;
  withContract: number;
  withoutContract: number;
}): string {
  const { debtors, totalCases, withContract, withoutContract } = params;

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

  const lines = debtors.map((row, index) => {
    const balance = row.balance ?? "—";
    const contract = row.contractAmount ?? NO_CONTRACT_YET_LABEL;
    const paid = row.paidAmount ?? "0 €";
    return `${index + 1}. ${row.name} — долг ${balance} (договор ${contract}, оплачено ${paid})`;
  });

  return [
    `Найдено ${debtors.length} должник(ов) по оплате (Finance, баланс > 0). Источник: Finance + Заявки портала Emigrant.`,
    "",
    ...lines,
    "",
    `Всего с договором: ${withContract}. Без суммы договора: ${withoutContract}.`,
  ].join("\n");
}
