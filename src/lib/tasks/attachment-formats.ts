export const MAX_TASK_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_TASK_ATTACHMENTS_PER_TASK = 10;
export const MAX_TASK_PROGRESS_REPORTS = 50;
export const MAX_TASK_PROGRESS_REPORT_COMMENT_LENGTH = 5000;

export const TASK_ATTACHMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "txt",
  "csv",
  "zip",
] as const;

export const ALLOWED_TASK_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
]);

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};

export function extFromFileName(fileName: string): string {
  const base = fileName.trim().split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function contentTypeFromExt(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

export function normalizeTaskAttachmentContentType(
  contentType: string,
  fileName: string,
): string {
  const base = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (ALLOWED_TASK_ATTACHMENT_TYPES.has(base)) return base;

  const ext = extFromFileName(fileName);
  if (ext && EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];

  return "";
}

export function isAllowedTaskAttachment(fileName: string, contentType: string): boolean {
  return Boolean(normalizeTaskAttachmentContentType(contentType, fileName));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function getTaskAttachmentUrl(taskId: string, attachmentId: string): string {
  return `/api/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export function canPreviewInline(contentType: string): boolean {
  const base = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  return base === "application/pdf" || base.startsWith("image/");
}

export const TASK_ATTACHMENT_ACCEPT = TASK_ATTACHMENT_EXTENSIONS.map(
  (ext) => `.${ext}`,
).join(",");

export const TASK_ATTACHMENT_HINT =
  "PDF, Word, Excel, PowerPoint, изображения (JPG, PNG, GIF, WebP), TXT, CSV, ZIP — до 25 МБ каждый";
