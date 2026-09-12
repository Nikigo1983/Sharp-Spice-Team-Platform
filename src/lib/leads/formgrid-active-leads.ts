import "server-only";

import {
  formgridSheetRowFromIndex,
  isFormgridRowDismissed,
} from "@/lib/leads/formgrid-row-key";
import { readLeadReviewStore } from "@/lib/leads/lead-review-store";
import type { LeadReviewStatus } from "@/lib/leads/lead-review-types";

export { isFormgridRowDismissed } from "@/lib/leads/formgrid-row-key";

/** Statuses that should disappear from «Новые клиенты» and active Formgrid search. */
const DISMISSED_STATUSES: ReadonlySet<LeadReviewStatus> = new Set([
  "rejected",
  "duplicate",
]);

export async function getDismissedFormgridRowKeys(): Promise<Set<string>> {
  const store = await readLeadReviewStore();
  const keys = new Set<string>();
  for (const review of Object.values(store.reviews)) {
    if (DISMISSED_STATUSES.has(review.status)) {
      keys.add(review.rowKey);
    }
  }
  return keys;
}

export type ActiveFormgridTable = {
  headers: string[];
  rows: string[][];
  /** 1-based Google Sheet row numbers aligned with `rows`. */
  sheetRows: number[];
  source: "google_sheets" | "demo";
};

export async function filterActiveFormgridTable(table: {
  headers: string[];
  rows: string[][];
  source: "google_sheets" | "demo";
}): Promise<ActiveFormgridTable> {
  const dismissed = await getDismissedFormgridRowKeys();
  if (dismissed.size === 0) {
    return {
      headers: table.headers,
      rows: table.rows,
      sheetRows: table.rows.map((_, index) => formgridSheetRowFromIndex(index)),
      source: table.source,
    };
  }

  const rows: string[][] = [];
  const sheetRows: number[] = [];
  table.rows.forEach((row, index) => {
    if (isFormgridRowDismissed(table.headers, row, dismissed)) return;
    rows.push(row);
    sheetRows.push(formgridSheetRowFromIndex(index));
  });

  return {
    headers: table.headers,
    rows,
    sheetRows,
    source: table.source,
  };
}
