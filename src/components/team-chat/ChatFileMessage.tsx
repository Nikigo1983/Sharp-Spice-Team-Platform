"use client";

import { formatFileSize } from "@/lib/tasks/attachment-formats";
import { FileTypeIcon } from "@/components/ui/UiIcon";
import styles from "./TeamChatView.module.css";

type ChatFileMessageProps = {
  src: string;
  fileName: string;
  fileSize: number | null;
  contentType: string | null;
};

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
      <FileTypeIcon contentType={contentType} className={styles.fileIcon} />
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
