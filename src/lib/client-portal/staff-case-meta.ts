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

export function updateStaffNote(
  answers: Record<string, unknown>,
  noteId: string,
  text: string,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const notes = readStaffNotes(answers);
  const index = notes.findIndex((item) => item.id === noteId);
  if (index < 0) return null;
  const next = [...notes];
  next[index] = { ...next[index]!, text: trimmed };
  return {
    ...answers,
    [NOTES_KEY]: next,
  };
}

export function removeStaffNote(
  answers: Record<string, unknown>,
  noteId: string,
): Record<string, unknown> | null {
  const notes = readStaffNotes(answers);
  if (!notes.some((item) => item.id === noteId)) return null;
  return {
    ...answers,
    [NOTES_KEY]: notes.filter((item) => item.id !== noteId),
  };
}

/** Notes with createdAt strictly after lastSeenAt (or all if never seen). */
export function countNewStaffNotes(
  notes: StaffCaseNote[],
  lastSeenAt: string | null | undefined,
): number {
  if (notes.length === 0) return 0;
  if (!lastSeenAt?.trim()) return notes.length;
  const seenMs = Date.parse(lastSeenAt);
  if (!Number.isFinite(seenMs)) return notes.length;
  return notes.filter((note) => {
    const createdMs = Date.parse(note.createdAt);
    return Number.isFinite(createdMs) && createdMs > seenMs;
  }).length;
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

export function renameStaffDocument(
  answers: Record<string, unknown>,
  documentId: string,
  fileName: string,
): Record<string, unknown> {
  const nextName = fileName.trim().slice(0, 255);
  return {
    ...answers,
    [DOCS_KEY]: readStaffDocuments(answers).map((item) =>
      item.id === documentId ? { ...item, fileName: nextName } : item,
    ),
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
