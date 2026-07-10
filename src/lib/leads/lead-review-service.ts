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
} from "@/lib/leads/formgrid-to-crm-mapper";
import { validateLeadForCrmCreate } from "@/lib/leads/lead-create-validation";
import {
  resolveDuplicateErrorCode,
  resolveValidationErrorCode,
} from "@/lib/leads/lead-review-action-errors";
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
import { listAllClients } from "@/lib/google-sheets/service";
import { LEAD_REVIEW_STATUS_LABELS } from "@/lib/leads/lead-review-types";
import { getFormgridClientFields } from "@/lib/google-sheets/formgrid-lookup";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { getCached, invalidateCache, setCached } from "@/lib/google-sheets/cache";
import { listEmigrantDeskClients } from "@/lib/emigrant-desk/clients";

type CrmWriteMode = "status_only" | "dry_run" | "write_blocked" | "write";

const LEAD_QUEUE_CACHE_KEY = "lead-review:queue";
const LEAD_DEDUP_CONTEXTS_CACHE_KEY = "lead-review:dedup-contexts";

type DedupContexts = Awaited<ReturnType<typeof loadDedupContexts>>;

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

async function loadDedupContexts(): Promise<{
  formgrid: Awaited<ReturnType<typeof getFormgridLeadsTable>>;
  fgContexts: ReturnType<typeof formgridRowToContext>[];
  crmContexts: ReturnType<typeof crmClientToContext>[];
  deskClients: Awaited<ReturnType<typeof listEmigrantDeskClients>>;
}> {
  const cached = getCached<DedupContexts>(LEAD_DEDUP_CONTEXTS_CACHE_KEY);
  if (cached) return cached;

  const [formgrid, { items: crmClients }, deskClients] = await Promise.all([
    getFormgridLeadsTable(),
    listAllClients(),
    listEmigrantDeskClients(),
  ]);

  const fgContexts = formgrid.rows.map((row, index) =>
    formgridRowToContext(formgrid.headers, row, index, 90 - index),
  );
  const crmContexts = crmClients.map((client, index) =>
    crmClientToContext(client, 100 - index),
  );

  const result = { formgrid, fgContexts, crmContexts, deskClients };
  setCached(LEAD_DEDUP_CONTEXTS_CACHE_KEY, result);
  return result;
}

async function persistLeadReview(
  record: LeadReviewRecord,
): Promise<LeadReviewRecord> {
  const saved = await upsertLeadReview(record);
  invalidateCache(LEAD_QUEUE_CACHE_KEY);
  return saved;
}

function analyzeLeadDedupForRow(
  leadCtx: ReturnType<typeof formgridRowToContext>,
  headers: string[],
  row: string[],
  crmContexts: DedupContexts["crmContexts"],
  fgContexts: DedupContexts["fgContexts"],
  deskClients: DedupContexts["deskClients"],
) {
  const fields = getFormgridClientFields(headers, row);
  return analyzeLeadDuplicates(leadCtx, crmContexts, fgContexts, deskClients, {
    name: fields.name,
    passport: fields.passport,
    email: fields.email,
  });
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
  const cached = getCached<{
    items: LeadQueueItem[];
    source: string;
    total: number;
  }>(LEAD_QUEUE_CACHE_KEY);
  if (cached) return cached;

  const [formgrid, reviewStore] = await Promise.all([
    getFormgridLeadsTable(),
    readLeadReviewStore(),
  ]);

  const items = formgrid.rows.map((row, index) => {
    const rowKey = buildFormgridRowKey(formgrid.headers, row);
    const reviewStatus = resolveReviewStatus(rowKey, reviewStore);
    const review = reviewStore.reviews[rowKey];

    return toQueueItem(
      formgrid.headers,
      row,
      index,
      reviewStatus,
      false,
      false,
      review?.updatedAt,
    );
  });

  items.sort((a, b) => b.sheetRow - a.sheetRow);

  const result = {
    items,
    source: formgrid.source,
    total: items.length,
  };
  setCached(LEAD_QUEUE_CACHE_KEY, result);
  return result;
}

export async function getLeadReviewDetail(
  sheetRow: number,
): Promise<LeadDetail | null> {
  const dataRowIndex = formgridDataRowIndexFromSheetRow(sheetRow);
  if (dataRowIndex < 0) return null;

  const { formgrid, fgContexts, crmContexts, deskClients } =
    await loadDedupContexts();
  const row = formgrid.rows[dataRowIndex];
  if (!row) return null;

  const leadCtx = fgContexts[dataRowIndex];
  const dedup = analyzeLeadDedupForRow(
    leadCtx,
    formgrid.headers,
    row,
    crmContexts,
    fgContexts,
    deskClients,
  );
  const rowKey = buildFormgridRowKey(formgrid.headers, row);
  const reviewStore = await readLeadReviewStore();
  const reviewStatus = resolveReviewStatus(rowKey, reviewStore);
  const review = reviewStore.reviews[rowKey];

  const base = toQueueItem(
    formgrid.headers,
    row,
    dataRowIndex,
    reviewStatus,
    dedup.hasBlockingStrongMatch,
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

    const { formgrid } = await loadDedupContexts();
    const row = formgrid.rows[dataRowIndex];
    if (!row) return null;
    const fields = getFormgridClientFields(formgrid.headers, row);
    const validationErrors = validateLeadForCrmCreate({
      name: fields.name,
      passport: fields.passport,
      phone: fields.phone,
      email: fields.email,
    });
    if (validationErrors.length > 0) {
      throw new LeadReviewActionError(
        422,
        resolveValidationErrorCode(validationErrors),
        `Validation failed: ${validationErrors.join(", ")}`,
      );
    }

    if (detail.dedup.hasBlockingStrongMatch) {
      const reasons = [
        ...new Set(detail.dedup.blockingStrongMatches.flatMap((m) => m.reasons)),
      ];
      throw new LeadReviewActionError(
        409,
        resolveDuplicateErrorCode(detail.dedup.blockingStrongMatches),
        `Strong duplicate found: ${reasons.join(", ")}`,
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
      await persistLeadReview(record);
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
      await persistLeadReview(record);
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

  await persistLeadReview(record);
  return getLeadReviewDetail(sheetRow);
}
