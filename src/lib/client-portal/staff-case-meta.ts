export type StaffCaseNote = {
  id: string;
  text: string;
  authorName: string;
  authorUserId: string;
  createdAt: string;
};

export type StaffCaseDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string;
  uploadedByUserId: string;
  createdAt: string;
};

const NOTES_KEY = "__staff_notes";
const DOCS_KEY = "__staff_documents";

function asNote(value: unknown): StaffCaseNote | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (
    typeof rec.id !== "string" ||
    typeof rec.text !== "string" ||
    typeof rec.authorName !== "string" ||
    typeof rec.authorUserId !== "string" ||
    typeof rec.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: rec.id,
    text: rec.text,
    authorName: rec.authorName,
    authorUserId: rec.authorUserId,
    createdAt: rec.createdAt,
  };
}

function asDocument(value: unknown): StaffCaseDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (
    typeof rec.id !== "string" ||
    typeof rec.fileName !== "string" ||
    typeof rec.mimeType !== "string" ||
    typeof rec.sizeBytes !== "number" ||
    typeof rec.uploadedByName !== "string" ||
    typeof rec.uploadedByUserId !== "string" ||
    typeof rec.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: rec.id,
    fileName: rec.fileName,
    mimeType: rec.mimeType,
    sizeBytes: rec.sizeBytes,
    uploadedByName: rec.uploadedByName,
    uploadedByUserId: rec.uploadedByUserId,
    createdAt: rec.createdAt,
  };
}

export function readStaffNotes(
  answers: Record<string, unknown> | null | undefined,
): StaffCaseNote[] {
  const raw = answers?.[NOTES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map(asNote).filter((item): item is StaffCaseNote => Boolean(item));
}

export function readStaffDocuments(
  answers: Record<string, unknown> | null | undefined,
): StaffCaseDocument[] {
  const raw = answers?.[DOCS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(asDocument)
    .filter((item): item is StaffCaseDocument => Boolean(item));
}

export function appendStaffNote(
  answers: Record<string, unknown>,
  note: StaffCaseNote,
): Record<string, unknown> {
  return {
    ...answers,
    [NOTES_KEY]: [...readStaffNotes(answers), note],
  };
}

export function appendStaffDocument(
  answers: Record<string, unknown>,
  doc: StaffCaseDocument,
): Record<string, unknown> {
  return {
    ...answers,
    [DOCS_KEY]: [...readStaffDocuments(answers), doc],
  };
}

export function removeStaffDocument(
  answers: Record<string, unknown>,
  documentId: string,
): Record<string, unknown> {
  return {
    ...answers,
    [DOCS_KEY]: readStaffDocuments(answers).filter((item) => item.id !== documentId),
  };
}

export function findStaffDocument(
  answers: Record<string, unknown> | null | undefined,
  documentId: string,
): StaffCaseDocument | null {
  return readStaffDocuments(answers).find((item) => item.id === documentId) ?? null;
}

export function staffDocumentsOwnerKey(questionnaireId: string): string {
  return `staff-${questionnaireId}`;
}
