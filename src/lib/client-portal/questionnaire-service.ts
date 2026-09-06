import "server-only";

import { randomUUID } from "node:crypto";
import type { ClientSession } from "./types";
import { SHARP_SPICE_ONBOARDING_SCHEMA } from "./questionnaire-schema";
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
  findQuestionnaireById,
  findQuestionnaireByUserId,
  listSubmittedQuestionnaires,
  upsertQuestionnaire,
} from "./questionnaire-store";
import {
  deleteQuestionnaireAttachmentFile,
  saveQuestionnaireAttachmentFile,
} from "./questionnaire-attachment-storage";
import { isAllowedAttachment } from "./questionnaire-attachment-formats";
import { writeStaffFields, type QuestionnaireStaffFields } from "./staff-fields";
import {
  appendStaffDocument,
  appendStaffNote,
  findStaffDocument,
  readStaffDocuments,
  readStaffNotes,
  removeStaffDocument,
  staffDocumentsOwnerKey,
  type StaffCaseDocument,
  type StaffCaseNote,
} from "./staff-case-meta";

export {
  calculateProgress,
  validateRequiredAnswers,
} from "./questionnaire-progress";

export function getPublishedSchema(): QuestionnaireSchema {
  return SHARP_SPICE_ONBOARDING_SCHEMA;
}

function allQuestions(): QuestionDefinition[] {
  return SHARP_SPICE_ONBOARDING_SCHEMA.sections.flatMap(
    (section) => section.questions,
  );
}

function hydrateAnswers(
  answers: QuestionnaireAnswers,
  portalEmail: string,
): QuestionnaireAnswers {
  const next = { ...answers };
  for (const question of allQuestions()) {
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
    let answers = hydrateAnswers(existing.answers, session.email);
    if (existing.status === "draft") {
      answers = stripLegacyNamePrefill(answers, session.firstName);
      if (isOrphanedDraftAnswers(answers)) {
        await purgeFileAnswers(session.id, answers);
        answers = hydrateAnswers({}, session.email);
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

  const missing = validateRequiredAnswers(current.answers, "ru");
  if (missing.length > 0) {
    throw new Error(`MISSING_REQUIRED:${missing.join(", ")}`);
  }

  const now = new Date().toISOString();
  const next: QuestionnaireRecord = {
    ...current,
    status: "submitted",
    submittedAt: now,
    updatedAt: now,
    revision: current.revision + 1,
  };
  await upsertQuestionnaire(next);
  return next;
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
  if (record.staffOpenedAt) return record;
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
    accept: ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp",
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

export async function deleteStaffCaseDocument(
  id: string,
  documentId: string,
): Promise<QuestionnaireRecord> {
  const current = await getSubmittedForStaff(id);
  if (!current) throw new Error("NOT_FOUND");
  const existing = findStaffDocument(current.answers, documentId);
  if (!existing) throw new Error("NOT_FOUND");

  await deleteQuestionnaireAttachmentFile(
    staffDocumentsOwnerKey(current.id),
    existing.id,
    existing.fileName,
  );
  const now = new Date().toISOString();
  return upsertQuestionnaire({
    ...current,
    answers: removeStaffDocument(current.answers, documentId),
    updatedAt: now,
    revision: current.revision + 1,
  });
}

export { readStaffNotes, readStaffDocuments, findStaffDocument, staffDocumentsOwnerKey };

export function buildReviewRows(
  answers: QuestionnaireAnswers,
  locale: "ru" | "en" = "ru",
): Array<{
  section: string;
  label: string;
  value: string;
  questionId: string;
  fileId?: string;
}> {
  const rows: Array<{
    section: string;
    label: string;
    value: string;
    questionId: string;
    fileId?: string;
  }> = [];
  for (const section of SHARP_SPICE_ONBOARDING_SCHEMA.sections) {
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
  return Boolean(findStaffDocument(record.answers, attachmentId));
}
