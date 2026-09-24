import "server-only";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  extractFormgridClientFields,
  FORMGRID_FILES_KEY,
  formgridFingerprint,
  formgridQuestionnaireId,
  formgridUserId,
  isFormgridNewClientQueue,
  mapFormgridRowToAnswers,
  parseFormgridSubmittedAtIso,
  setFormgridNewClientQueue,
  syntheticEmailFromFormgrid,
  type FormgridSheetRow,
} from "@/lib/client-portal/formgrid-import";
import { upsertClientPortalUser } from "@/lib/client-portal/local-store";
import {
  findQuestionnaireById,
  listSubmittedQuestionnaires,
  upsertQuestionnaire,
} from "@/lib/client-portal/questionnaire-store";
import type { QuestionnaireRecord } from "@/lib/client-portal/questionnaire-types";
import { isApplicationSubmitted } from "@/lib/client-portal/application-submitted";
import { ingestFormgridExternalFiles } from "@/lib/client-portal/formgrid-file-ingest";
import { buildFormgridRowKey } from "@/lib/leads/formgrid-row-key";
import { getDismissedFormgridRowKeys } from "@/lib/leads/formgrid-active-leads";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { ensureQuestionnaireWordDocument } from "@/lib/client-portal/questionnaire-service";

const EXCLUDED_FULL_NAMES = ["белоусова вероника николаевна"];

function normalizePersonName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isExcludedName(fullName: string): boolean {
  const n = normalizePersonName(fullName);
  if (!n) return false;
  return EXCLUDED_FULL_NAMES.some(
    (ex) => n === ex || n.startsWith(`${ex} `) || n.includes(ex),
  );
}

function normalizePassport(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeEmail(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function sheetRowFromHeaders(
  headers: string[],
  row: string[],
): FormgridSheetRow {
  const sheetColumns: FormgridSheetRow = {};
  headers.forEach((h, idx) => {
    sheetColumns[String(h || `col_${idx}`)] = row[idx] ?? "";
  });
  return sheetColumns;
}

export type SyncFormgridRowResult = {
  status:
    | "created"
    | "updated"
    | "already_exists"
    | "skipped_duplicate"
    | "skipped_excluded"
    | "skipped_empty"
    | "skipped_dismissed";
  questionnaireId?: string;
  clientName: string;
  record?: QuestionnaireRecord;
};

/**
 * Upsert one Formgrid sheet row into Emigrant «Клиенты» intake.
 * When `markAsNew` is true, the case gets the yellow «Новый клиент» queue flag.
 */
export async function syncFormgridSheetRowToPortal(input: {
  headers: string[];
  row: string[];
  sheetRow: number;
  markAsNew?: boolean;
}): Promise<SyncFormgridRowResult> {
  const markAsNew = input.markAsNew !== false;
  const sheetColumns = sheetRowFromHeaders(input.headers, input.row);
  const fields = extractFormgridClientFields(sheetColumns);
  const clientName = fields.fullName || "Клиент Formgrid";

  if (!fields.fullName && !fields.email && !fields.passport && !fields.phone) {
    return { status: "skipped_empty", clientName };
  }
  if (isExcludedName(fields.fullName)) {
    return { status: "skipped_excluded", clientName };
  }

  const dismissed = await getDismissedFormgridRowKeys();
  const rowKey = buildFormgridRowKey(input.headers, input.row);
  if (dismissed.has(rowKey)) {
    return { status: "skipped_dismissed", clientName };
  }

  const leadId = `sheet-${input.sheetRow}`;
  const fingerprint = formgridFingerprint(sheetColumns, leadId);
  const questionnaireId = formgridQuestionnaireId(fingerprint);
  const userId = formgridUserId(fingerprint);
  const passport = normalizePassport(fields.passport);
  const emailNorm = normalizeEmail(fields.email);

  const existing = await findQuestionnaireById(questionnaireId);
  if (!existing) {
    const all = await listSubmittedQuestionnaires();
    for (const q of all) {
      if (q.id === questionnaireId) continue;
      const answers = q.answers ?? {};
      const qPassport = normalizePassport(answers.passport_number);
      const qEmail =
        normalizeEmail(answers.contact_email) || normalizeEmail(q.email);
      if (passport && qPassport && passport === qPassport) {
        return {
          status: "skipped_duplicate",
          clientName,
          questionnaireId: q.id,
          record: q,
        };
      }
      if (
        emailNorm &&
        emailNorm.includes("@") &&
        !emailNorm.endsWith("@import.local") &&
        qEmail === emailNorm
      ) {
        return {
          status: "skipped_duplicate",
          clientName,
          questionnaireId: q.id,
          record: q,
        };
      }
    }
  }

  const importedAt = new Date().toISOString();
  let answers: Record<string, unknown> = mapFormgridRowToAnswers(sheetColumns, {
    leadId,
    sheetRow: input.sheetRow,
    fingerprint,
    importedAt,
    newClientQueue: markAsNew,
  });

  if (existing) {
    // Preserve staff/archive/files/application-submitted; refresh sheet payload.
    answers = {
      ...answers,
      ...(existing.answers.__archive
        ? { __archive: existing.answers.__archive }
        : {}),
      ...(existing.answers.__applicationSubmitted
        ? {
            __applicationSubmitted: existing.answers.__applicationSubmitted,
          }
        : {}),
      ...(existing.answers.__staff
        ? { __staff: existing.answers.__staff }
        : {}),
      ...(existing.answers.__staff_documents
        ? { __staff_documents: existing.answers.__staff_documents }
        : {}),
      ...(existing.answers[FORMGRID_FILES_KEY]
        ? { [FORMGRID_FILES_KEY]: existing.answers[FORMGRID_FILES_KEY] }
        : {}),
      ...(existing.answers.__crmOpsSheet
        ? { __crmOpsSheet: existing.answers.__crmOpsSheet }
        : {}),
    };
    // Keep already-ingested portal file fields (passport PDF, etc.).
    for (const [key, value] of Object.entries(existing.answers)) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof (value as { id?: unknown }).id === "string" &&
        typeof (value as { fileName?: unknown }).fileName === "string" &&
        (key.startsWith("doc_") || key === "doc_signature_sample")
      ) {
        answers[key] = value;
      }
    }
    if (
      markAsNew &&
      !isApplicationSubmitted(existing.answers) &&
      !isFormgridNewClientQueue(answers)
    ) {
      answers = setFormgridNewClientQueue(answers, true);
    }
    if (isApplicationSubmitted(existing.answers)) {
      answers = setFormgridNewClientQueue(answers, false);
    }
  }

  const displayEmail = syntheticEmailFromFormgrid(leadId, fields.email);
  const userEmail = `formgrid.${fingerprint}@import.local`;
  const firstName =
    (fields.fullName || "").trim().split(/\s+/)[0] || "Клиент";
  const submittedAt =
    parseFormgridSubmittedAtIso(fields.submittedAt) || importedAt;
  const now = new Date().toISOString();
  const deadPasswordHash = await bcrypt.hash(
    `formgrid-disabled-${randomBytes(16).toString("hex")}`,
    10,
  );

  await upsertClientPortalUser({
    id: userId,
    email: userEmail,
    firstName,
    preferredLocale: "ru",
    invitationId: null,
    passwordHash: deadPasswordHash,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  let record = await upsertQuestionnaire({
    id: questionnaireId,
    clientPortalUserId: userId,
    invitationId: null,
    email: displayEmail,
    firstName,
    status: "submitted",
    answers,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    submittedAt: existing?.submittedAt ?? submittedAt,
    staffOpenedAt: existing?.staffOpenedAt ?? null,
  });

  try {
    const ingested = await ingestFormgridExternalFiles(record);
    record = ingested.record;
    if (ingested.downloaded > 0 || ingested.mirrored > 0) {
      console.info("[formgrid-to-portal] files ingested", {
        questionnaireId,
        downloaded: ingested.downloaded,
        mirrored: ingested.mirrored,
        failed: ingested.failed,
      });
    }
  } catch (error) {
    console.error("[formgrid-to-portal] file ingest failed", {
      questionnaireId,
      error,
    });
  }

  try {
    const word = await ensureQuestionnaireWordDocument(record.id);
    record = word.record;
    if (word.created) {
      console.info("[formgrid-to-portal] Word questionnaire created", {
        questionnaireId,
        fileName: word.document.fileName,
      });
    }
  } catch (error) {
    console.error("[formgrid-to-portal] Word export failed", {
      questionnaireId,
      error,
    });
  }

  return {
    status: existing ? "updated" : "created",
    questionnaireId,
    clientName,
    record,
  };
}

/** Sync Formgrid leads whose full name contains `nameQuery` (case-insensitive). */
export async function syncFormgridLeadsByNameQuery(
  nameQuery: string,
  options?: { markAsNew?: boolean },
): Promise<SyncFormgridRowResult[]> {
  const q = normalizePersonName(nameQuery);
  if (!q) return [];

  const table = await getFormgridLeadsTable();
  const results: SyncFormgridRowResult[] = [];

  for (let index = 0; index < table.rows.length; index++) {
    const row = table.rows[index]!;
    const sheetColumns = sheetRowFromHeaders(table.headers, row);
    const fields = extractFormgridClientFields(sheetColumns);
    if (!normalizePersonName(fields.fullName).includes(q)) continue;
    const sheetRow = index + 2;
    results.push(
      await syncFormgridSheetRowToPortal({
        headers: table.headers,
        row,
        sheetRow,
        markAsNew: options?.markAsNew !== false,
      }),
    );
  }
  return results;
}
