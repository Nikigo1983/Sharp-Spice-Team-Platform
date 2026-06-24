"use client";

import { useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth/types";
import {
  formatFileSize,
  getTaskAttachmentUrl,
  TASK_ATTACHMENT_ACCEPT,
  TASK_ATTACHMENT_HINT,
} from "@/lib/tasks/attachment-formats";
import { formatTaskDateTime } from "@/lib/tasks/format";
import {
  canAddTaskProgressReport,
  canDeleteTaskProgressReport,
} from "@/lib/tasks/permissions";
import type { Task, TaskProgressReport } from "@/lib/tasks/types";
import styles from "./TaskProgressReports.module.css";

type TaskProgressReportsSectionProps = {
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

export function TaskProgressReportsSection({
  task,
  user,
  onTaskUpdated,
}: TaskProgressReportsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canAdd = canAddTaskProgressReport(task, user);

  const reports = [...task.progressReports].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  async function handleSubmit() {
    const trimmed = comment.trim();
    if (!trimmed) {
      setError("Напишите комментарий к отчёту");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("comment", trimmed);
      if (pendingFile) formData.append("file", pendingFile);

      const res = await fetch(
        `/api/tasks/${encodeURIComponent(task.id)}/progress-reports`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Не удалось отправить отчёт");
      }
      const data = (await res.json()) as { task?: Task };
      if (data.task) onTaskUpdated?.(data.task);
      setComment("");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить отчёт");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(report: TaskProgressReport) {
    if (!window.confirm("Удалить этот отчёт?")) return;
    setError("");
    try {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(task.id)}/progress-reports/${encodeURIComponent(report.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete failed");
      const data = (await res.json()) as { task?: Task };
      if (data.task) onTaskUpdated?.(data.task);
    } catch {
      setError("Не удалось удалить отчёт");
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>Отчёты исполнителей</h3>
        {reports.length > 0 ? (
          <span className={styles.count}>{reports.length}</span>
        ) : null}
      </div>

      {canAdd ? (
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>Ваш отчёт</span>
            <textarea
              className={styles.textarea}
              rows={3}
              value={comment}
              disabled={submitting}
              placeholder="Опишите, что сделано по вашей части задачи…"
              onChange={(e) => {
                setComment(e.target.value);
                if (error) setError("");
              }}
            />
          </label>

          <div className={styles.fileRow}>
            <input
              ref={fileInputRef}
              type="file"
              accept={TASK_ATTACHMENT_ACCEPT}
              className={styles.hiddenInput}
              disabled={submitting}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setPendingFile(file);
              }}
            />
            <button
              type="button"
              className={styles.uploadBtn}
              disabled={submitting}
              onClick={() => fileInputRef.current?.click()}
            >
              {pendingFile ? "Заменить файл" : "+ Прикрепить файл"}
            </button>
            {pendingFile ? (
              <span className={styles.pendingFile}>
                {pendingFile.name} · {formatFileSize(pendingFile.size)}
                <button
                  type="button"
                  className={styles.clearFileBtn}
                  disabled={submitting}
                  aria-label="Убрать файл"
                  onClick={() => {
                    setPendingFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  ×
                </button>
              </span>
            ) : null}
          </div>
          <p className={styles.hint}>
            Файл необязателен. {TASK_ATTACHMENT_HINT}
          </p>
          <button
            type="button"
            className={styles.submitBtn}
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "Отправка…" : "Отправить отчёт"}
          </button>
        </div>
      ) : null}

      {reports.length === 0 ? (
        <p className={styles.empty}>
          {canAdd
            ? "Пока нет отчётов. Оставьте комментарий о проделанной работе."
            : "Исполнители ещё не оставили отчётов."}
        </p>
      ) : (
        <ol className={styles.list}>
          {reports.map((report) => {
            const canDelete = canDeleteTaskProgressReport(task, report, user);
            return (
              <li key={report.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={styles.author}>{report.authorName}</span>
                  <time className={styles.time}>
                    {formatTaskDateTime(report.createdAt)}
                  </time>
                  {canDelete ? (
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      aria-label="Удалить отчёт"
                      onClick={() => void handleDelete(report)}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <p className={styles.comment}>{report.comment}</p>
                {report.attachment ? (
                  <a
                    href={getTaskAttachmentUrl(task.id, report.attachment.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.fileLink}
                    title="Открыть файл"
                  >
                    <span className={styles.fileIcon}>
                      {fileIcon(report.attachment.contentType)}
                    </span>
                    <span className={styles.fileMeta}>
                      <span className={styles.fileName}>
                        {report.attachment.fileName}
                      </span>
                      <span className={styles.fileSub}>
                        {formatFileSize(report.attachment.size)}
                      </span>
                    </span>
                  </a>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
