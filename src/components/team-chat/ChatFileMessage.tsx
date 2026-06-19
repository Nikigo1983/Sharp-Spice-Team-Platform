"use client";

import { formatFileSize } from "@/lib/tasks/attachment-formats";
import styles from "./TeamChatView.module.css";

type ChatFileMessageProps = {
  src: string;
  fileName: string;
  fileSize: number | null;
  contentType: string | null;
};

function fileIcon(contentType: string | null): string {
  const type = contentType?.toLowerCase() ?? "";
  if (type === "application/pdf") return "📄";
  if (type.includes("spreadsheet") || type.includes("excel")) return "📊";
  if (type.includes("word")) return "📝";
  if (type.includes("presentation") || type.includes("powerpoint")) return "📽";
  if (type.includes("zip")) return "🗜";
  return "📎";
}

export function ChatFileMessage({
  src,
  fileName,
  fileSize,
  contentType,
}: ChatFileMessageProps) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.fileLink}
      title="Открыть файл"
    >
      <span className={styles.fileIcon}>{fileIcon(contentType)}</span>
      <span className={styles.fileMeta}>
        <span className={styles.fileName}>{fileName}</span>
        {fileSize != null ? (
          <span className={styles.fileSub}>{formatFileSize(fileSize)}</span>
        ) : null}
      </span>
    </a>
  );
}

export const CHAT_DOCUMENT_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";
