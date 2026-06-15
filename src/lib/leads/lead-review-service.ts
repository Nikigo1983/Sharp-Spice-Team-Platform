import "server-only";

import { crmClientToContext, formgridRowToContext } from "@/lib/ai/client-context";
import { normalizePassport } from "@/lib/ai/client-passport";
import {
  buildFormgridRowKey,
  formgridDataRowIndexFromSheetRow,
  formgridSheetRowFromIndex,
} from "@/lib/leads/formgrid-row-key";
import { analyzeLeadDuplicates } from "@/lib/leads/lead-review-dedup";
import {
  readLeadReviewStore,
  resolveReviewStatus,
  upsertLeadReview,
} from "@/lib/leads/lead-review-store";
import type {
  LeadDetail,
  LeadQueueItem,
  LeadReviewAction,
  LeadReviewRecord,
  LeadReviewStatus,
} from "@/lib/leads/lead-review-types";
import { LEAD_REVIEW_STATUS_LABELS } from "@/lib/leads/lead-review-types";
import { getFormgridClientFields } from "@/lib/google-sheets/formgrid-lookup";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { listAllClients } from "@/lib/google-sheets/service";

function buildSurveyFields(
  headers: string[],
  row: string[],
): Array<{ label: string; value: string }> {
  return headers
    .map((header, index) => ({
      label: header.trim(),
      value: (row[index] ?? "").trim(),
    }))
    .filter((field) => field.label && field.value);
}

function toQueueItem(
  headers: string[],
  row: string[],
  dataRowIndex: number,
  reviewStatus: LeadReviewStatus,
  dedupStrong: boolean,
  dedupPossible: boolean,
  updatedAt?: string,
): LeadQueueItem {
  const fields = getFormgridClientFields(headers, row);
  const sheetRow = formgridSheetRowFromIndex(dataRowIndex);
  const rowKey = buildFormgridRowKey(headers, row);

  return {
    id: String(sheetRow),
    sheetRow,
    rowKey,
    name: fields.name,
    passport: fields.passport,
    phone: fields.phone,
    email: fields.email,
    submittedAt: fields.submittedAt,
    source: "Formgrid",
    reviewStatus,
    reviewStatusLabel: LEAD_REVIEW_STATUS_LABELS[reviewStatus],
    hasStrongDuplicate: dedupStrong,
    hasPossibleDuplicate: dedupPossible,
    updatedAt,
  };
}

async function loadFormgridContexts() {
  const [formgrid, { items: crmClients }] = await Promise.all([
    getFormgridLeadsTable(),
    listAllClients(),
  ]);

  const fgContexts = formgrid.rows.map((row, index) =>
    formgridRowToContext(formgrid.headers, row, index, 90 - index),
  );
  const crmContexts = crmClients.map((client, index) =>
    crmClientToContext(client, 100 - index),
  );

  return { formgrid, fgContexts, crmContexts };
}

export async function listLeadReviewQueue(): Promise<{
  items: LeadQueueItem[];
  source: string;
  total: number;
}> {
  const { formgrid, fgContexts, crmContexts } = await loadFormgridContexts();
  const reviewStore = await readLeadReviewStore();

  const items = formgrid.rows.map((row, index) => {
    const leadCtx = fgContexts[index];
    const dedup = analyzeLeadDuplicates(leadCtx, crmContexts, fgContexts);
    const rowKey = buildFormgridRowKey(formgrid.headers, row);
    const reviewStatus = resolveReviewStatus(rowKey, reviewStore);
    const review = reviewStore.reviews[rowKey];

    return toQueueItem(
      formgrid.headers,
      row,
      index,
      reviewStatus,
      dedup.hasStrongMatch,
      dedup.hasPossibleMatch,
      review?.updatedAt,
    );
  });

  items.sort((a, b) => b.sheetRow - a.sheetRow);

  return {
    items,
    source: formgrid.source,
    total: items.length,
  };
}

export async function getLeadReviewDetail(
  sheetRow: number,
): Promise<LeadDetail | null> {
  const dataRowIndex = formgridDataRowIndexFromSheetRow(sheetRow);
  if (dataRowIndex < 0) return null;

  const { formgrid, fgContexts, crmContexts } = await loadFormgridContexts();
  const row = formgrid.rows[dataRowIndex];
  if (!row) return null;

  const leadCtx = fgContexts[dataRowIndex];
  const dedup = analyzeLeadDuplicates(leadCtx, crmContexts, fgContexts);
  const rowKey = buildFormgridRowKey(formgrid.headers, row);
  const reviewStore = await readLeadReviewStore();
  const reviewStatus = resolveReviewStatus(rowKey, reviewStore);
  const review = reviewStore.reviews[rowKey];

  const base = toQueueItem(
    formgrid.headers,
    row,
    dataRowIndex,
    reviewStatus,
    dedup.hasStrongMatch,
    dedup.hasPossibleMatch,
    review?.updatedAt,
  );

  return {
    ...base,
    surveyFields: buildSurveyFields(formgrid.headers, row),
    dedup,
    review: review ?? undefined,
  };
}

function statusForAction(action: LeadReviewAction): LeadReviewStatus {
  switch (action) {
    case "mark_reviewed":
      return "reviewed";
    case "mark_duplicate":
      return "duplicate";
    case "reject":
      return "rejected";
    case "create_in_crm":
      return "created_in_crm";
  }
}

export async function applyLeadReviewAction(
  sheetRow: number,
  action: LeadReviewAction,
  updatedBy: string,
): Promise<LeadDetail | null> {
  const detail = await getLeadReviewDetail(sheetRow);
  if (!detail) return null;

  const status = statusForAction(action);

  const record: LeadReviewRecord = {
    rowKey: detail.rowKey,
    sheetRow: detail.sheetRow,
    status,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  if (action === "create_in_crm") {
    const passportNorm = normalizePassport(detail.passport);
    record.pendingCrmClientId = passportNorm || `FG-ROW-${detail.sheetRow}`;
    record.note =
      "CRM write-path не подключён — статус зафиксирован, запись в Google Sheets будет в следующей фазе.";
  }

  await upsertLeadReview(record);
  return getLeadReviewDetail(sheetRow);
}
