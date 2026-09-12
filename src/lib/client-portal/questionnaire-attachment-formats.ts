/**
 * Allowed formats and size limits for questionnaire / staff case document uploads.
 */

export const DEFAULT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Staff case documents (portal intake) — PDF, images, Word, Excel. */
export const STAFF_CASE_DOCUMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const STAFF_CASE_DOCUMENT_HINT =
  "Можно выбрать несколько файлов сразу. PDF, Word, Excel или изображение до 10 МБ каждый. Файлы видны только сотрудникам.";

export const STAFF_CASE_DOCUMENT_TYPES_LABEL =
  "PDF, Word, Excel и изображения (JPG, PNG, WEBP)";

export function extFromFileName(fileName: string): string {
  const base = fileName.trim().split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function contentTypeFromExt(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

function parseAcceptList(accept?: string): { exts: Set<string>; mimes: Set<string> } {
  const exts = new Set<string>();
  const mimes = new Set<string>();
  if (!accept) {
    Object.keys(EXT_TO_MIME).forEach((ext) => exts.add(ext));
    Object.values(EXT_TO_MIME).forEach((mime) => mimes.add(mime));
    return { exts, mimes };
  }
  for (const part of accept.split(",")) {
    const token = part.trim().toLowerCase();
    if (!token) continue;
    if (token.startsWith(".")) {
      exts.add(token.slice(1));
    } else if (token.includes("/")) {
      mimes.add(token);
    } else {
      exts.add(token);
    }
  }
  return { exts, mimes };
}

export function isAllowedAttachment(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  accept?: string;
  maxSizeMb?: number;
}): { ok: true; mimeType: string } | { ok: false; reason: "too_large" | "unsupported_type" } {
  const maxBytes = (input.maxSizeMb ?? 10) * 1024 * 1024;
  if (input.sizeBytes <= 0 || input.sizeBytes > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  const ext = extFromFileName(input.fileName);
  const mimeFromExt = ext ? EXT_TO_MIME[ext] : undefined;
  const rawMime = input.contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  const mimeType =
    (mimeFromExt &&
    (!rawMime ||
      rawMime === "application/octet-stream" ||
      rawMime === "application/zip")
      ? mimeFromExt
      : rawMime) ||
    mimeFromExt ||
    "";

  const { exts, mimes } = parseAcceptList(input.accept);
  const extOk = ext ? exts.has(ext) : false;
  const mimeOk = mimeType ? mimes.has(mimeType) : false;
  if (!extOk && !mimeOk) {
    return { ok: false, reason: "unsupported_type" };
  }

  return {
    ok: true,
    mimeType: mimeFromExt || mimeType || "application/octet-stream",
  };
}
