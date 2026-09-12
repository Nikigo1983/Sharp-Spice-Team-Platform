"use client";

import { useRef, useState } from "react";
import type { ClientDocument } from "@/lib/google-sheets/types";
import {
  CLIENT_DOCUMENT_ACCEPT,
  CLIENT_DOCUMENT_HINT,
  formatFileSize,
  getClientDocumentUrl,
} from "@/lib/clients/document-formats";
import { FileTypeIcon } from "@/components/ui/UiIcon";
import styles from "./ClientDocuments.module.css";

type ClientDocumentsProps = {
  clientId: string;
  initialDocuments: ClientDocument[];
};

function isPlatformUpload(doc: ClientDocument): boolean {
  return (
    doc.source === "upload" ||
    Boolean(doc.fileName && doc.contentType && doc.sizeBytes != null)
  );
}

export function ClientDocuments({
  clientId,
  initialDocuments,
}: ClientDocumentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpload(selected: FileList | null) {
    if (!selected?.length) return;
    setUploading(true);
    setError("");
    try {
      let latest: ClientDocument[] | null = null;
      for (const file of Array.from(selected)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(
          `/api/clients/${encodeURIComponent(clientId)}/documents`,
          { method: "POST", body: formData },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Не удалось прикрепить файл");
        }
        const data = (await res.json()) as { documents?: ClientDocument[] };
        if (data.documents) latest = data.documents;
      }
      if (latest) setDocuments(latest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(doc: ClientDocument) {
    if (!window.confirm(`Удалить файл «${doc.fileName ?? doc.name}»?`)) return;
    setError("");
    try {
      const res = await fetch(
        `/api/clients/${encodeURIComponent(clientId)}/documents/${encodeURIComponent(doc.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete failed");
      const data = (await res.json()) as { documents?: ClientDocument[] };
      if (data.documents) setDocuments(data.documents);
    } catch {
      setError("Не удалось удалить файл");
    }
  }

  function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.uploadRow}>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={CLIENT_DOCUMENT_ACCEPT}
          className={styles.hiddenInput}
          onChange={(e) => void handleUpload(e.target.files)}
        />
        <button
          type="button"
          className={styles.uploadBtn}
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Загрузка…" : "+ Прикрепить документ"}
        </button>
        <p className={styles.hint}>{CLIENT_DOCUMENT_HINT}</p>
      </div>

      {documents.length === 0 ? (
        <p className={styles.empty}>Документы пока не прикреплены.</p>
      ) : (
        <ul className={styles.list}>
          {documents.map((doc) => {
            const canManage = isPlatformUpload(doc);
            const fileName = doc.fileName ?? doc.name;
            const openUrl = canManage
              ? getClientDocumentUrl(clientId, doc.id)
              : null;
            const downloadUrl = canManage
              ? getClientDocumentUrl(clientId, doc.id, { download: true })
              : null;
            const metaParts = [
              doc.category,
              canManage && doc.sizeBytes != null
                ? formatFileSize(doc.sizeBytes)
                : null,
              doc.uploadedBy,
              formatDate(doc.uploadedAt),
            ].filter(Boolean);

            return (
              <li key={doc.id} className={styles.item}>
                <div className={styles.fileMain}>
                  <FileTypeIcon
                    contentType={doc.contentType ?? ""}
                    className={styles.fileIcon}
                  />
                  <span className={styles.fileMeta}>
                    <span className={styles.fileName}>{fileName}</span>
                    <span className={styles.fileSub}>
                      {metaParts.join(" · ")}
                    </span>
                  </span>
                </div>

                {canManage && openUrl && downloadUrl ? (
                  <div className={styles.actions}>
                    <a
                      href={openUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.actionBtn}
                    >
                      Открыть
                    </a>
                    <a
                      href={downloadUrl}
                      className={styles.actionBtn}
                      download={fileName}
                    >
                      Скачать
                    </a>
                    <button
                      type="button"
                      className={styles.deleteAction}
                      onClick={() => void handleDelete(doc)}
                    >
                      Удалить
                    </button>
                  </div>
                ) : (
                  <span className={styles.sheetOnly}>только запись</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
