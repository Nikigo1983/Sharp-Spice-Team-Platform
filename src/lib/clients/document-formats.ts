import {
  ALLOWED_TASK_ATTACHMENT_TYPES,
  MAX_TASK_ATTACHMENT_BYTES,
  TASK_ATTACHMENT_ACCEPT,
  TASK_ATTACHMENT_EXTENSIONS,
  TASK_ATTACHMENT_HINT,
  canPreviewInline,
  contentTypeFromExt,
  extFromFileName,
  formatFileSize,
  isAllowedTaskAttachment,
  normalizeTaskAttachmentContentType,
} from "@/lib/tasks/attachment-formats";

export const MAX_CLIENT_DOCUMENT_BYTES = MAX_TASK_ATTACHMENT_BYTES;
export const MAX_CLIENT_DOCUMENTS_PER_CLIENT = 20;

export const CLIENT_DOCUMENT_EXTENSIONS = TASK_ATTACHMENT_EXTENSIONS;
export const ALLOWED_CLIENT_DOCUMENT_TYPES = ALLOWED_TASK_ATTACHMENT_TYPES;
export const CLIENT_DOCUMENT_ACCEPT = TASK_ATTACHMENT_ACCEPT;
export const CLIENT_DOCUMENT_HINT = TASK_ATTACHMENT_HINT;

export {
  canPreviewInline,
  contentTypeFromExt,
  extFromFileName,
  formatFileSize,
  isAllowedTaskAttachment as isAllowedClientDocument,
  normalizeTaskAttachmentContentType as normalizeClientDocumentContentType,
};

export function getClientDocumentUrl(clientId: string, documentId: string): string {
  return `/api/clients/${encodeURIComponent(clientId)}/documents/${encodeURIComponent(documentId)}`;
}
