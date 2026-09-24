import "server-only";

import { randomUUID } from "node:crypto";
import type { ClientSession } from "./types";
import { CROATIA_TRP_SCHEMA } from "./questionnaire-schema";
import {
  needsVnzhCountrySelection,
  resolveSchemaForRecord,
} from "./questionnaire-templates";
import type {
  QuestionnaireAnswers,
  QuestionnaireRecord,
  QuestionnaireSchema,
  QuestionDefinition,
} from "./questionnaire-types";
import {
  isFileAnswer,
  isQuestionVisible,
  pickLabel,
} from "./questionnaire-types";
import {
  isOrphanedDraftAnswers,
  validateRequiredAnswers,
} from "./questionnaire-progress";
import {
  deleteQuestionnaire,
  findQuestionnaireById,
  findQuestionnaireByUserId,
  listSubmittedQuestionnaires,
  upsertQuestionnaire,
} from "./questionnaire-store";
import { createClientInvitation } from "./auth-service";
import {
  deleteClientPortalUser,
  findClientPortalUserByEmail,
} from "./local-store";
import {
  deleteQuestionnaireAttachmentFile,
  saveQuestionnaireAttachmentFile,
} from "./questionnaire-attachment-storage";
import { isAllowedAttachment, STAFF_CASE_DOCUMENT_ACCEPT, renameFileNamePreservingExt } from "./questionnaire-attachment-formats";
import { mirrorQuestionnaireFilesIntoStaffDocuments } from "./questionnaire-file-mirror";
import {
  buildQuestionnaireWordDoc,
  findQuestionnaireWordDocument,
  isQuestionnaireMirroredAttachment,
  questionnaireWordFilename,
  QUESTIONNAIRE_WORD_UPLOADER_ID,
  QUESTIONNAIRE_WORD_UPLOADER_NAME,
} from "./questionnaire-word-export";
import { writeStaffFields, type QuestionnaireStaffFields } from "./staff-fields";
import {
  buildLegacyReviewRows,
  isLegacyCrmImport,
  applyLegacySheetEdits,
  readLegacyIdentity,
} from "./legacy-crm";
import {
  applyFormgridCrmOpsEdits,
  buildFormgridReviewRows,
  buildManagerFillReviewRows,
  emptyFormgridCrmOpsSheet,
  FORMGRID_CRM_OPS_KEY,
  isFormgridImport,
  readFormgridCrmOpsSheet,
  readFormgridStoredFiles,
} from "./formgrid-import";
import { markManualStaffAnswers } from "./client-source";
import { notifyNewClient } from "@/lib/notifications/emit";
import {
  isCaseArchived,
  writeCaseArchive,
} from "./case-archive";
import { writeApplicationSubmitted } from "./application-submitted";
import { isImportStaffOpenStamp, isPortalNewClientBadge } from "./questionnaire-new";
import {
  appendStaffDocument,
  appendStaffNote,
  findStaffDocument,
  readStaffDocuments,
  readStaffNotes,
  removeStaffDocument,
  renameStaffDocument,
  staffDocumentsOwnerKey,
  type StaffCaseDocument,
  type StaffCaseNote,
} from "./staff-case-meta";
import {
  INITIAL_PROCESS_STATUS,
  isProcessStatusValue,
  readProcessStatus,
  writeProcessStatus,
  type ProcessStatusState,
  type ProcessStatusValue,
} from "./process-status";
import { sendProcessStatusChangedEmail } from "./portal-emails";

export {
  calculateProgress,
  validateRequiredAnswers,
} from "./questionnaire-progress";

export function getPublishedSchema(): QuestionnaireSchema {
  return CROATIA_TRP_SCHEMA;
}

export function getSchemaForRecord(
  record: Pick<QuestionnaireRecord, "status" | "answers">,
): QuestionnaireSchema {
  return resolveSchemaForRecord(record);
}

function allQuestions(
  schema: QuestionnaireSchema = CROATIA_TRP_SCHEMA,
): QuestionDefinition[] {
  return schema.sections.flatMap((section) => section.questions);
}

function hydrateAnswers(
  answers: QuestionnaireAnswers,
  portalEmail: string,
  schema: QuestionnaireSchema = CROATIA_TRP_SCHEMA,
): QuestionnaireAnswers {
  const next = { ...answers };
  for (const question of allQuestions(schema)) {
    if (question.derivedFrom === "portal_email") {
      if (!next[question.id] || String(next[question.id]).trim() === "") {
        next[question.id] = portalEmail;
      }
    }
  }
  return next;
}

/** Old drafts stored invite firstName as FIO — clear that leftover. */
function stripLegacyNamePrefill(
  answers: QuestionnaireAnswers,
  firstName: string,
): QuestionnaireAnswers {
  const next = { ...answers };
  delete next.first_name;
  const inviteName = firstName.trim();
  const cyrillic = String(next.full_name_cyrillic ?? "").trim();
  if (inviteName && cyrillic === inviteName) {
    delete next.full_name_cyrillic;
  }
  return next;
}

function answersChanged(
  before: QuestionnaireAnswers,
  after: QuestionnaireAnswers,
): boolean {
  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after).sort();
  if (beforeKeys.length !== afterKeys.length) return true;
  if (beforeKeys.some((key, i) => key !== afterKeys[i])) return true;
  return beforeKeys.some((key) => before[key] !== after[key]);
}

async function purgeFileAnswers(
  ownerKey: string,
  answers: QuestionnaireAnswers,
): Promise<void> {
  for (const value of Object.values(answers)) {
    if (!isFileAnswer(value)) continue;
    void deleteQuestionnaireAttachmentFile(ownerKey, value.id, value.fileName);
  }
}

export async function getOrCreateQuestionnaire(
  session: ClientSession,
): Promise<QuestionnaireRecord> {
  const existing = await findQuestionnaireByUserId(session.id);
  if (existing) {
    const schema = resolveSchemaForRecord(existing);
    let answers = hydrateAnswers(existing.answers, session.email, schema);
    if (existing.status === "draft") {
      answers = stripLegacyNamePrefill(answers, session.firstName);
      if (isOrphanedDraftAnswers(answers, schema)) {
        await purgeFileAnswers(session.id, answers);
        answers = hydrateAnswers({}, session.email, schema);
      }
      if (answersChanged(existing.answers, answers)) {
        const cleaned: QuestionnaireRecord = {
          ...existing,
          answers,
          updatedAt: new Date().toISOString(),
        };
        await upsertQuestionnaire(cleaned);
        return cleaned;
      }
    }
    return {
      ...existing,
      answers,
    };
  }

  const now = new Date().toISOString();
  const record: QuestionnaireRecord = {
    id: randomUUID(),
    clientPortalUserId: session.id,
    invitationId: session.invitationId,
    email: session.email,
    firstName: session.firstName,
    status: "draft",
    answers: hydrateAnswers({}, session.email),
    revision: 1,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    staffOpenedAt: null,
  };
  await upsertQuestionnaire(record);
  return record;
}

/** Merge patch into answers; `null` clears a field (needed for file delete). */
function applyAnswerPatch(
  current: QuestionnaireAnswers,
  patch: QuestionnaireAnswers,
): QuestionnaireAnswers {
  const next: QuestionnaireAnswers = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (key.startsWith("__staff")) continue;
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

export async function saveQuestionnaireAnswers(
  session: ClientSession,
  input: { id: string; answers: QuestionnaireAnswers; expectedRevision: number },
): Promise<QuestionnaireRecord> {
  const current = await findQuestionnaireById(input.id);
  if (!current || current.clientPortalUserId !== session.id) {
    throw new Error("NOT_FOUND");
  }
  if (current.status === "submitted") {
    throw new Error("ALREADY_SUBMITTED");
  }
  if (current.revision !== input.expectedRevision) {
    throw new Error("REVISION_CONFLICT");
  }

  const now = new Date().toISOString();
  const next: QuestionnaireRecord = {
    ...current,
    answers: hydrateAnswers(
      applyAnswerPatch(current.answers, input.answers),
      session.email,
    ),
    revision: current.revision + 1,
    updatedAt: now,
  };
  await upsertQuestionnaire(next);
  return next;
}

export async function submitQuestionnaire(
  session: ClientSession,
  id: string,
  answers?: QuestionnaireAnswers,
  expectedRevision?: number,
): Promise<QuestionnaireRecord> {
  let current = await findQuestionnaireById(id);
  if (!current || current.clientPortalUserId !== session.id) {
    throw new Error("NOT_FOUND");
  }
  if (current.status === "submitted") {
    return current;
  }

  if (answers) {
    current = await saveQuestionnaireAnswers(session, {
      id,
      answers,
      expectedRevision:
        typeof expectedRevision === "number"
          ? expectedRevision
          : current.revision,
    });
  }

  if (needsVnzhCountrySelection(current)) {
    throw new Error("COUNTRY_REQUIRED");
  }

  const missing = validateRequiredAnswers(
    current.answers,
    "ru",
    getSchemaForRecord(current),
  );
  if (missing.length > 0) {
    throw new Error(`MISSING_REQUIRED:${missing.join(", ")}`);
  }

  const now = new Date().toISOString();
  const withStatus = writeProcessStatus(current.answers, {
    value: INITIAL_PROCESS_STATUS,
    updatedAt: now,
    updatedByUserId: null,
    updatedByName: null,
  });
  const withCrmOps = {
    ...withStatus,
    [FORMGRID_CRM_OPS_KEY]: readFormgridCrmOpsSheet(withStatus),
  };
  const mirrored = mirrorQuestionnaireFilesIntoStaffDocuments(
    withCrmOps,
    now,
  );
  const next: QuestionnaireRecord = {
    ...current,
    status: "submitted",
    submittedAt: now,
    updatedAt: now,
    revision: current.revision + 1,
    answers: mirrored.answers,
  };
  await upsertQuestionnaire(next);
  try {
    const clientName =
      String(next.answers.full_name_cyrillic ?? "").trim() ||
      String(next.answers.full_name_latin ?? "").trim() ||
      next.firstName ||
      next.email;
    await notifyNewClient({
      clientName,
      source: "Портал Emigrant",
      caseId: next.id,
      destination: "intake",
    });
  } catch (error) {
    console.error("[questionnaire] notifyNewClient failed", error);
  }
  try {
    const withWord = await ensureQuestionnaireWordDocument(next.id);
    return withWord.record;
  } catch (error) {
    console.error("[questionnaire] Word export on submit failed", error);
    return next;
  }
}

/**
 * Manager creates a submitted intake case and provisions portal login
 * (same invite email + temporary password as /client-invitations).
 */
export async function createManualCaseForStaff(input: {
  email: string;
  firstName: string;
  fullNameCyrillic?: string;
  phone?: string;
  createdByUserId: string;
  createdByName: string;
  origin: string;
}): Promise<{
  record: QuestionnaireRecord;
  temporaryPassword: string;
  loginUrl: string;
  emailSent: boolean;
  emailError?: "EMAIL_NOT_CONFIGURED" | "EMAIL_SEND_FAILED";
}> {
  const firstName = input.firstName.trim();
  const fullName =
    input.fullNameCyrillic?.trim() || firstName;
  const phone = input.phone?.trim() || "";

  if (!firstName) {
    throw new Error("INVALID_BODY");
  }

  const invite = await createClientInvitation({
    email: input.email,
    firstName,
    createdByUserId: input.createdByUserId,
    origin: input.origin,
  });

  const user = await findClientPortalUserByEmail(invite.invitation.email);
  if (!user) {
    throw new Error("USER_MISSING");
  }

  const existing = await findQuestionnaireByUserId(user.id);
  if (existing?.status === "submitted") {
    throw new Error("CASE_EXISTS");
  }

  const now = new Date().toISOString();
  const baseAnswers: QuestionnaireAnswers = {
    full_name_cyrillic: fullName,
  };
  if (phone) {
    baseAnswers.phone = phone;
  }

  const answers = {
    ...writeProcessStatus(
      markManualStaffAnswers(hydrateAnswers(baseAnswers, user.email), {
        createdByUserId: input.createdByUserId,
        createdByName: input.createdByName,
        createdAt: now,
      }),
      {
        value: INITIAL_PROCESS_STATUS,
        updatedAt: now,
        updatedByUserId: input.createdByUserId,
        updatedByName: input.createdByName,
      },
    ),
    [FORMGRID_CRM_OPS_KEY]: emptyFormgridCrmOpsSheet(),
  };

  const record: QuestionnaireRecord = {
    id: existing?.id ?? randomUUID(),
    clientPortalUserId: user.id,
    invitationId: user.invitationId ?? invite.invitation.id,
    email: user.email,
    firstName: user.firstName,
    status: "submitted",
    answers,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    submittedAt: now,
    staffOpenedAt: null,
  };

  await upsertQuestionnaire(record);

  return {
    record,
    temporaryPassword: invite.temporaryPassword,
    loginUrl: invite.loginUrl,
    emailSent: invite.emailSent,
    emailError: invite.emailError,
  };
}

export async function listSubmittedForStaff(): Promise<QuestionnaireRecord[]> {
  return listSubmittedQuestionnaires();
}

export async function getSubmittedForStaff(
  id: string,
): Promise<QuestionnaireRecord | null> {
  const record = await findQuestionnaireById(id);
  if (!record || record.status !== "submitted") return null;
  return record;
}

export async function markQuestionnaireOpenedByStaff(
  id: string,
): Promise<QuestionnaireRecord | null> {
  const record = await getSubmittedForStaff(id);
  if (!record) return null;
  // Import scripts used to stamp staffOpenedAt at import time — overwrite that
  // with a real open timestamp so the yellow badge can clear.
  if (record.staffOpenedAt && !isImportStaffOpenStamp(record)) {
    return record;
  }
  const now = new Date().toISOString();
  return upsertQuestionnaire({
    ...record,
    staffOpenedAt: now,
    updatedAt: now,
  });
}

export async function updateSubmittedStaffFields(
  id: string,
  fields: Partial<QuestionnaireStaffFields>,
): Promise<QuestionnaireRecord> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");
  const now = new Date().toISOString();
  return upsertQuestionnaire({
    ...current,
    answers: writeStaffFields(current.answers, fields),
    updatedAt: now,
    revision: current.revision + 1,
  });
}

export async function updateCaseArchiveState(
  id: string,
  input: {
    archived: boolean;
    archivedByUserId: string;
    archivedByName: string;
  },
): Promise<QuestionnaireRecord> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");
  const now = new Date().toISOString();
  return upsertQuestionnaire({
    ...current,
    answers: writeCaseArchive(current.answers, {
      archived: input.archived,
      archivedAt: input.archived ? now : null,
      archivedByName: input.archived ? input.archivedByName : null,
      archivedByUserId: input.archived ? input.archivedByUserId : null,
    }),
    updatedAt: now,
    revision: current.revision + 1,
  });
}

/**
 * Staff «Заявка подана» — only for portal «Новый клиент» cases.
 * Returns { record, changed }. If not a new portal client, returns unchanged record.
 */
export async function markApplicationSubmittedByStaff(
  id: string,
  input: { submittedByUserId: string; submittedByName: string },
): Promise<{ record: QuestionnaireRecord; changed: boolean }> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");
  if (!isPortalNewClientBadge(current)) {
    return { record: current, changed: false };
  }
  const now = new Date().toISOString();
  const record = await upsertQuestionnaire({
    ...current,
    answers: writeApplicationSubmitted(current.answers, {
      submittedAt: now,
      submittedByUserId: input.submittedByUserId,
      submittedByName: input.submittedByName,
    }),
    updatedAt: now,
    revision: current.revision + 1,
  });
  return { record, changed: true };
}

/** Permanently remove a portal user, their questionnaire, and uploaded files. */
export async function deletePortalUserAccount(userId: string): Promise<void> {
  const current = await findQuestionnaireByUserId(userId);
  if (current) {
    const staffOwner = staffDocumentsOwnerKey(current.id);
    for (const doc of readStaffDocuments(current.answers)) {
      await deleteQuestionnaireAttachmentFile(
        staffOwner,
        doc.id,
        doc.fileName,
      );
    }
    await purgeFileAnswers(current.clientPortalUserId, current.answers);
    await deleteQuestionnaire(current.id);
  }
  await deleteClientPortalUser(userId);
}

/** Permanently remove a submitted case, its files, and the portal user account. */
export async function deleteSubmittedCaseForStaff(id: string): Promise<void> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");

  await deletePortalUserAccount(current.clientPortalUserId);
}

export async function updateLegacyCaseSheetFields(
  id: string,
  fields: Record<string, string>,
): Promise<QuestionnaireRecord> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");
  if (!isLegacyCrmImport(current.answers)) {
    throw new Error("NOT_LEGACY");
  }
  const now = new Date().toISOString();
  const answers = applyLegacySheetEdits(current.answers, fields);
  const identity = readLegacyIdentity(answers);
  const firstName =
    (identity?.fullNameCyrillic || "").trim().split(/\s+/)[0] ||
    current.firstName;
  const email =
    (identity?.email || "").trim() ||
    current.email;

  return upsertQuestionnaire({
    ...current,
    firstName,
    email,
    answers,
    updatedAt: now,
    revision: current.revision + 1,
  });
}

export async function updateFormgridCrmOpsFields(
  id: string,
  fields: Record<string, string>,
): Promise<QuestionnaireRecord> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");
  // Portal / Formgrid / manual cases share __crmOpsSheet. Legacy uses __legacySheet.
  if (isLegacyCrmImport(current.answers)) {
    throw new Error("NOT_FORMGRID");
  }
  const now = new Date().toISOString();
  return upsertQuestionnaire({
    ...current,
    answers: applyFormgridCrmOpsEdits(current.answers, fields),
    updatedAt: now,
    revision: current.revision + 1,
  });
}

export async function updateSubmittedAnswerFields(
  id: string,
  fields: Record<string, string>,
  crmOpsSheet?: Record<string, string> | null,
): Promise<QuestionnaireRecord> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");
  const now = new Date().toISOString();
  let answers = { ...current.answers };
  for (const [key, value] of Object.entries(fields)) {
    if (!key || key.startsWith("__")) continue;
    answers[key] = value;
  }
  if (crmOpsSheet && typeof crmOpsSheet === "object") {
    answers = applyFormgridCrmOpsEdits(answers, crmOpsSheet);
  }
  return upsertQuestionnaire({
    ...current,
    answers,
    updatedAt: now,
    revision: current.revision + 1,
  });
}

export { isCaseArchived };

export async function addStaffCaseNote(
  id: string,
  input: { text: string; authorUserId: string; authorName: string },
): Promise<{ record: QuestionnaireRecord; note: StaffCaseNote }> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");
  const text = input.text.trim();
  if (!text) throw new Error("EMPTY_NOTE");
  const note: StaffCaseNote = {
    id: randomUUID(),
    text,
    authorName: input.authorName,
    authorUserId: input.authorUserId,
    createdAt: new Date().toISOString(),
  };
  const now = new Date().toISOString();
  const record = await upsertQuestionnaire({
    ...current,
    answers: appendStaffNote(current.answers, note),
    updatedAt: now,
    revision: current.revision + 1,
  });
  return { record, note };
}

export async function addStaffCaseDocument(
  id: string,
  input: {
    fileName: string;
    contentType: string;
    data: Buffer;
    uploadedByUserId: string;
    uploadedByName: string;
  },
): Promise<{ record: QuestionnaireRecord; document: StaffCaseDocument }> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");

  const allowed = isAllowedAttachment({
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.data.length,
    accept: STAFF_CASE_DOCUMENT_ACCEPT,
    maxSizeMb: 10,
  });
  if (!allowed.ok) {
    throw new Error(
      allowed.reason === "too_large" ? "FILE_TOO_LARGE" : "UNSUPPORTED_FILE_TYPE",
    );
  }

  const documentId = randomUUID();
  const fileName = input.fileName.slice(0, 255);
  await saveQuestionnaireAttachmentFile(
    staffDocumentsOwnerKey(current.id),
    documentId,
    fileName,
    input.data,
    allowed.mimeType,
  );

  const document: StaffCaseDocument = {
    id: documentId,
    fileName,
    mimeType: allowed.mimeType,
    sizeBytes: input.data.length,
    uploadedByName: input.uploadedByName,
    uploadedByUserId: input.uploadedByUserId,
    createdAt: new Date().toISOString(),
  };
  const now = new Date().toISOString();
  const record = await upsertQuestionnaire({
    ...current,
    answers: appendStaffDocument(current.answers, document),
    updatedAt: now,
    revision: current.revision + 1,
  });
  return { record, document };
}

/**
 * Copy client questionnaire file answers into `__staff_documents` (same file ids,
 * storage stays under the portal user). Idempotent by attachment id.
 */
export { mirrorQuestionnaireFilesIntoStaffDocuments } from "./questionnaire-file-mirror";

/** Backfill «Документы по клиенту» from questionnaire file fields for older cases. */
export async function ensureQuestionnaireFileDocuments(
  id: string,
): Promise<{ record: QuestionnaireRecord; added: number }> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");

  const mirrored = mirrorQuestionnaireFilesIntoStaffDocuments(
    current.answers,
    current.submittedAt ?? current.updatedAt,
  );
  if (mirrored.added === 0) {
    return { record: current, added: 0 };
  }

  const now = new Date().toISOString();
  const record = await upsertQuestionnaire({
    ...current,
    answers: mirrored.answers,
    updatedAt: now,
    revision: current.revision + 1,
  });
  return { record, added: mirrored.added };
}

/** Create Word copy of the filled questionnaire in «Документы по клиенту» if missing. */
export async function ensureQuestionnaireWordDocument(
  id: string,
): Promise<{
  record: QuestionnaireRecord;
  document: StaffCaseDocument;
  created: boolean;
}> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");

  const existing = findQuestionnaireWordDocument(
    readStaffDocuments(current.answers),
  );
  if (existing) {
    return { record: current, document: existing, created: false };
  }

  const clientName =
    String(current.answers.full_name_cyrillic ?? "").trim() ||
    String(current.answers.full_name_latin ?? "").trim() ||
    current.firstName ||
    current.email;
  const submittedAtLabel = current.submittedAt
    ? new Date(current.submittedAt).toLocaleString("ru-RU")
    : "—";
  const rows = buildReviewRows(current.answers, "ru").map((row) => ({
    section: row.section,
    label: row.label,
    value: row.value,
  }));
  const html = buildQuestionnaireWordDoc({
    clientName,
    email: current.email,
    submittedAtLabel,
    rows,
  });
  const fileName = questionnaireWordFilename(clientName, current.submittedAt);
  const result = await addStaffCaseDocument(id, {
    fileName,
    contentType: "application/msword",
    data: Buffer.from(`\uFEFF${html}`, "utf8"),
    uploadedByUserId: QUESTIONNAIRE_WORD_UPLOADER_ID,
    uploadedByName: QUESTIONNAIRE_WORD_UPLOADER_NAME,
  });
  return {
    record: result.record,
    document: result.document,
    created: true,
  };
}

export async function deleteStaffCaseDocument(
  id: string,
  documentId: string,
): Promise<QuestionnaireRecord> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");
  const existing = findStaffDocument(current.answers, documentId);
  if (!existing) throw new Error("NOT_FOUND");

  // Mirrored questionnaire files live under the portal user — only unlink the list entry.
  if (!isQuestionnaireMirroredAttachment(existing)) {
    await deleteQuestionnaireAttachmentFile(
      staffDocumentsOwnerKey(current.id),
      existing.id,
      existing.fileName,
    );
  }
  const now = new Date().toISOString();
  return upsertQuestionnaire({
    ...current,
    answers: removeStaffDocument(current.answers, documentId),
    updatedAt: now,
    revision: current.revision + 1,
  });
}

export async function renameStaffCaseDocument(
  id: string,
  documentId: string,
  nextFileName: string,
): Promise<{ record: QuestionnaireRecord; document: StaffCaseDocument }> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");
  const existing = findStaffDocument(current.answers, documentId);
  if (!existing) throw new Error("NOT_FOUND");

  const fileName = renameFileNamePreservingExt(existing.fileName, nextFileName);
  if (!fileName) throw new Error("INVALID_NAME");
  if (fileName === existing.fileName) {
    return { record: current, document: existing };
  }

  const now = new Date().toISOString();
  const record = await upsertQuestionnaire({
    ...current,
    answers: renameStaffDocument(current.answers, documentId, fileName),
    updatedAt: now,
    revision: current.revision + 1,
  });
  const document = findStaffDocument(record.answers, documentId);
  if (!document) throw new Error("NOT_FOUND");
  return { record, document };
}

export async function updateSubmittedProcessStatus(
  id: string,
  input: {
    status: string;
    updatedByUserId: string;
    updatedByName: string;
    portalOrigin: string;
  },
): Promise<{
  record: QuestionnaireRecord;
  processStatus: ProcessStatusState;
  emailSent: boolean;
  unchanged: boolean;
}> {
  if (!isProcessStatusValue(input.status)) {
    throw new Error("INVALID_STATUS");
  }
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");

  const previous = readProcessStatus(current.answers, current.status);
  if (previous?.value === input.status) {
    return {
      record: current,
      processStatus: previous,
      emailSent: false,
      unchanged: true,
    };
  }

  const now = new Date().toISOString();
  const processStatus: ProcessStatusState = {
    value: input.status as ProcessStatusValue,
    updatedAt: now,
    updatedByUserId: input.updatedByUserId,
    updatedByName: input.updatedByName,
  };
  const record = await upsertQuestionnaire({
    ...current,
    answers: writeProcessStatus(current.answers, processStatus),
    updatedAt: now,
    revision: current.revision + 1,
  });

  const portalUrl = `${input.portalOrigin.replace(/\/$/, "")}/client`;
  const mailed = await sendProcessStatusChangedEmail({
    to: current.email,
    firstName: current.firstName || "клиент",
    status: processStatus.value,
    portalUrl,
  });

  void import("@/lib/notifications/emit")
    .then(({ notifyClientCaseStatusChanged }) =>
      notifyClientCaseStatusChanged({
        portalUserId: current.clientPortalUserId,
        statusLabel: processStatus.value,
        actorName: input.updatedByName,
      }),
    )
    .catch((error) => {
      console.error("[client-case] notify status failed", error);
    });

  return {
    record,
    processStatus,
    emailSent: mailed.ok,
    unchanged: false,
  };
}

export { readStaffNotes, readStaffDocuments, findStaffDocument, staffDocumentsOwnerKey };
export { readProcessStatus, INITIAL_PROCESS_STATUS };
export type { ProcessStatusState, ProcessStatusValue };

export function buildReviewRows(
  answers: QuestionnaireAnswers,
  locale: "ru" | "en" = "ru",
): Array<{
  section: string;
  label: string;
  value: string;
  questionId: string;
  fileId?: string;
  externalUrl?: string;
}> {
  if (isLegacyCrmImport(answers)) {
    return buildLegacyReviewRows(answers, locale);
  }
  if (isFormgridImport(answers)) {
    return buildFormgridReviewRows(answers, locale);
  }

  const rows: Array<{
    section: string;
    label: string;
    value: string;
    questionId: string;
    fileId?: string;
    externalUrl?: string;
  }> = [];
  for (const section of resolveSchemaForRecord({
    status: "submitted",
    answers,
  }).sections) {
    for (const question of section.questions) {
      if (question.type === "information") continue;
      if (!isQuestionVisible(question, answers)) continue;
      const raw = answers[question.id];
      let value = "";
      let fileId: string | undefined;
      if (question.type === "boolean") {
        value =
          raw === true
            ? locale === "ru"
              ? "Да"
              : "Yes"
            : raw === false
              ? locale === "ru"
                ? "Нет"
                : "No"
              : "";
      } else if (question.type === "yes_no") {
        value =
          raw === "yes"
            ? locale === "ru"
              ? "Да"
              : "Yes"
            : raw === "no"
              ? locale === "ru"
                ? "Нет"
                : "No"
              : "";
      } else if (question.type === "file" && isFileAnswer(raw)) {
        value = `${raw.fileName} (${Math.round(raw.sizeBytes / 1024)} KB)`;
        fileId = raw.id;
      } else if (question.type === "select" && question.options) {
        const option = question.options.find((item) => item.value === raw);
        value = option ? pickLabel(option.label, locale) : String(raw ?? "");
      } else {
        value = raw == null ? "" : String(raw);
      }
      rows.push({
        section: pickLabel(section.title, locale),
        label: pickLabel(question.label, locale),
        value,
        questionId: question.id,
        fileId,
      });
    }
  }

  // Staff-editable ops block (same fields as Formgrid «Для заполнения менеджером»).
  rows.push(...buildManagerFillReviewRows(readFormgridCrmOpsSheet(answers)));
  return rows;
}

export function findFileAnswerInRecord(
  record: QuestionnaireRecord,
  attachmentId: string,
) {
  for (const value of Object.values(record.answers)) {
    if (isFileAnswer(value) && value.id === attachmentId) {
      return value;
    }
  }
  const formgridFiles = readFormgridStoredFiles(record.answers);
  for (const stored of Object.values(formgridFiles)) {
    if (stored.id === attachmentId) {
      return {
        id: stored.id,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
      };
    }
  }
  const staffDoc = findStaffDocument(record.answers, attachmentId);
  if (staffDoc) {
    return {
      id: staffDoc.id,
      fileName: staffDoc.fileName,
      mimeType: staffDoc.mimeType,
      sizeBytes: staffDoc.sizeBytes,
    };
  }
  return null;
}

export function isStaffUploadedDocument(
  record: QuestionnaireRecord,
  attachmentId: string,
): boolean {
  const doc = findStaffDocument(record.answers, attachmentId);
  if (!doc) return false;
  // Bytes for mirrored questionnaire files are stored under the portal user id.
  if (isQuestionnaireMirroredAttachment(doc)) return false;
  return true;
}
