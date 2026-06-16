import "server-only";

import { crmClientToContext, formgridRowToContext } from "@/lib/ai/client-context";
import { normalizePassport } from "@/lib/ai/client-passport";
import { getGoogleSheetsClient } from "@/lib/google-sheets/google-sheets-client";
import {
  buildFormgridRowKey,
  formgridDataRowIndexFromSheetRow,
  formgridSheetRowFromIndex,
} from "@/lib/leads/formgrid-row-key";
import {
  buildExternalRowFromFormgridLead,
  validateLeadForCrmCreate,
} from "@/lib/leads/formgrid-to-crm-mapper";
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

type CrmWriteMode = "status_only" | "dry_run" | "write_blocked" | "write";

export class LeadReviewActionError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

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

function isEnabled(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function resolveCrmWriteMode(): CrmWriteMode {
  const enabled = isEnabled("CRM_WRITE_ENABLED");
  const dryRun = isEnabled("CRM_WRITE_DRY_RUN");
  if (!enabled && !dryRun) return "status_only";
  if (!enabled && dryRun) return "dry_run";
  if (enabled && dryRun) return "write_blocked";
  return "write";
}

function getClientsWriteRange(): string {
  return process.env.GOOGLE_SHEETS_CLIENTS_RANGE?.trim() || "'В Работе'!A:M";
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
  const mode = resolveCrmWriteMode();
  const currentStatus = detail.reviewStatus;

  const record: LeadReviewRecord = {
    rowKey: detail.rowKey,
    sheetRow: detail.sheetRow,
    status,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  if (action === "create_in_crm") {
    const dataRowIndex = formgridDataRowIndexFromSheetRow(detail.sheetRow);
    if (dataRowIndex < 0) return null;

    const { formgrid } = await loadFormgridContexts();
    const row = formgrid.rows[dataRowIndex];
    if (!row) return null;
    const fields = getFormgridClientFields(formgrid.headers, row);
    const validationErrors = validateLeadForCrmCreate({
      name: fields.name,
      passport: fields.passport,
      phone: fields.phone,
    });
    if (validationErrors.length > 0) {
      throw new LeadReviewActionError(
        422,
        "validation_error",
        `Validation failed: ${validationErrors.join(", ")}`,
      );
    }

    const strongReasons = detail.dedup.strongMatches
      .flatMap((m) => m.reasons)
      .filter((r) =>
        ["passport", "email", "телефон", "phone", "Telegram", "telegram"].includes(
          r,
        ),
      );
    if (strongReasons.length > 0) {
      throw new LeadReviewActionError(
        409,
        "duplicate_detected",
        `Strong duplicate found: ${[...new Set(strongReasons)].join(", ")}`,
      );
    }

    const passportNorm = normalizePassport(detail.passport);
    record.pendingCrmClientId = passportNorm || `FG-ROW-${detail.sheetRow}`;
    const rowValues = buildExternalRowFromFormgridLead({
      headers: formgrid.headers,
      row,
      sheetRow: detail.sheetRow,
      updatedBy,
    });
    const targetRange = getClientsWriteRange();

    if (mode === "status_only") {
      record.status = currentStatus;
      record.note = "CRM write disabled: status-only mode.";
      record.crmWritePreview = {
        mode,
        targetRange,
        rowValues,
      };
      await upsertLeadReview(record);
      return getLeadReviewDetail(sheetRow);
    }

    if (mode === "dry_run" || mode === "write_blocked") {
      record.status = currentStatus;
      record.note =
        mode === "write_blocked"
          ? "CRM write blocked: CRM_WRITE_ENABLED=true and CRM_WRITE_DRY_RUN=true."
          : "CRM dry-run preview generated. No write executed.";
      record.crmWritePreview = {
        mode,
        targetRange,
        rowValues,
      };
      await upsertLeadReview(record);
      return getLeadReviewDetail(sheetRow);
    }

    const ok = await getGoogleSheetsClient().appendExternalClientRow(rowValues);
    if (!ok) {
      throw new LeadReviewActionError(
        500,
        "append_failed",
        "Google Sheets append failed",
      );
    }
    // Fail-closed: created_in_crm set only after successful append.
    record.status = "created_in_crm";
    record.note = "CRM row appended successfully.";
    record.crmWritePreview = {
      mode: "write",
      targetRange,
      rowValues,
    };
  }

  await upsertLeadReview(record);
  return getLeadReviewDetail(sheetRow);
}
