"use client";

import { useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth/types";
import {
  formatFileSize,
  getTaskAttachmentUrl,
  TASK_ATTACHMENT_ACCEPT,
  TASK_ATTACHMENT_HINT,
} from "@/lib/tasks/attachment-formats";
import {
  canDeleteTaskAttachment,
  canManageTaskAttachments,
} from "@/lib/tasks/permissions";
import type { Task, TaskAttachment } from "@/lib/tasks/types";
import styles from "./TaskAttachments.module.css";

type TaskAttachmentsSectionProps = {
  task: Task;
  user: SessionUser;
  onTaskUpdated?: (task: Task) => void;
};

function fileIcon(contentType: string): string {
  if (contentType.startsWith("image/")) return "🖼";
  if (contentType === "application/pdf") return "📄";
  if (contentType.includes("spreadsheet") || contentType.includes("excel")) {
    return "📊";
  }
  if (contentType.includes("word")) return "📝";
  if (contentType.includes("presentation") || contentType.includes("powerpoint")) {
    return "📽";
  }
  if (contentType.includes("zip")) return "🗜";
  return "📎";
}

export async function uploadTaskFiles(taskId: string, files: File[]): Promise<Task> {
  let latestTask: Task | null = null;
  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/attachments`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Не удалось прикрепить файл");
    }
    const data = (await res.json()) as { task?: Task };
    if (data.task) latestTask = data.task;
  }
  if (!latestTask) throw new Error("Не удалось прикрепить файл");
  return latestTask;
}

export function TaskAttachmentsSection({
  task,
  user,
  onTaskUpdated,
}: TaskAttachmentsSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const canUpload = canManageTaskAttachments(task, user);

  async function handleUpload(selected: FileList | null) {
    if (!selected?.length) return;
    setUploading(true);
    setError("");
    try {
      const taskAfter = await uploadTaskFiles(task.id, Array.from(selected));
      onTaskUpdated?.(taskAfter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(attachment: TaskAttachment) {
    if (!window.confirm(`Удалить файл «${attachment.fileName}»?`)) return;
    setError("");
    try {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(task.id)}/attachments/${encodeURIComponent(attachment.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete failed");
      const data = (await res.json()) as { task?: Task };
      if (data.task) onTaskUpdated?.(data.task);
    } catch {
      setError("Не удалось удалить файл");
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>Файлы</h3>
        {canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={TASK_ATTACHMENT_ACCEPT}
              className={styles.hiddenInput}
              onChange={(e) => void handleUpload(e.target.files)}
            />
            <button
              type="button"
              className={styles.uploadBtn}
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? "Загрузка…" : "+ Прикрепить"}
            </button>
          </>
        ) : null}
      </div>

      {canUpload ? <p className={styles.hint}>{TASK_ATTACHMENT_HINT}</p> : null}

      {task.attachments.length === 0 ? (
        <p className={styles.empty}>Файлы не прикреплены.</p>
      ) : (
        <ul className={styles.list}>
          {task.attachments.map((attachment) => {
            const url = getTaskAttachmentUrl(task.id, attachment.id);
            const canDelete = canDeleteTaskAttachment(task, attachment, user);
            return (
              <li key={attachment.id} className={styles.item}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.fileLink}
                  title="Открыть файл"
                >
                  <span className={styles.fileIcon}>{fileIcon(attachment.contentType)}</span>
                  <span className={styles.fileMeta}>
                    <span className={styles.fileName}>{attachment.fileName}</span>
                    <span className={styles.fileSub}>
                      {formatFileSize(attachment.size)} · {attachment.uploadedByName}
                    </span>
                  </span>
                </a>
                {canDelete ? (
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    aria-label="Удалить файл"
                    onClick={() => void handleDelete(attachment)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}

type TaskAttachmentPickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

export function TaskAttachmentPicker({
  files,
  onChange,
  disabled = false,
}: TaskAttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(selected: FileList | null) {
    if (!selected?.length) return;
    onChange([...files, ...Array.from(selected)]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className={styles.picker}>
      <div className={styles.pickerHeader}>
        <span className={styles.label}>Файлы</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={TASK_ATTACHMENT_ACCEPT}
          className={styles.hiddenInput}
          disabled={disabled}
          onChange={(e) => addFiles(e.target.files)}
        />
        <button
          type="button"
          className={styles.uploadBtn}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          + Выбрать файлы
        </button>
      </div>
      <p className={styles.hint}>{TASK_ATTACHMENT_HINT}</p>
      {files.length > 0 ? (
        <ul className={styles.pendingList}>
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className={styles.pendingItem}>
              <span className={styles.pendingName}>{file.name}</span>
              <span className={styles.pendingSize}>{formatFileSize(file.size)}</span>
              <button
                type="button"
                className={styles.deleteBtn}
                disabled={disabled}
                aria-label="Убрать файл"
                onClick={() => removeFile(index)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
