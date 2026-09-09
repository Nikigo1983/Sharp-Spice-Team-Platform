/**
 * Heuristics for discovering filterable Formgrid columns by header labels.
 */

export type FormgridFilterColumnKey =
  | "submitted"
  | "partner"
  | "referent"
  | "contract"
  | "amount"
  | "approval";

export function findFormgridFilterColumns(
  headers: string[],
): Partial<Record<FormgridFilterColumnKey, number>> {
  const found: Partial<Record<FormgridFilterColumnKey, number>> = {};
  headers.forEach((header, index) => {
    const h = header ?? "";
    if (
      found.submitted == null &&
      (/^date$/i.test(h.trim()) ||
        /timestamp|submitted|created.?at|дата.*подач|дата.*отправ|дата.*заполн|дата.*создан/i.test(
          h,
        ))
    ) {
      found.submitted = index;
    }
    if (found.partner == null && /партн/i.test(h)) found.partner = index;
    if (
      found.referent == null &&
      /референт|куратор|менеджер|manager|referent/i.test(h)
    ) {
      found.referent = index;
    }
    if (found.contract == null && /договор|contract/i.test(h)) {
      found.contract = index;
    }
    if (
      found.amount == null &&
      /сумм|стоим|оплат|amount|price|cost|цена/i.test(h)
    ) {
      found.amount = index;
    }
    if (found.approval == null && /одобрен|approval|внж/i.test(h)) {
      found.approval = index;
    }
  });
  return found;
}

export const FORMGRID_FILTER_LABELS: Record<FormgridFilterColumnKey, string> = {
  submitted: "Дата подачи",
  partner: "Партнёр",
  referent: "Референт / куратор",
  contract: "Договор",
  amount: "Стоимость / оплата",
  approval: "Одобрение",
};
