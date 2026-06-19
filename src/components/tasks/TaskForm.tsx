"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { TASK_STATUS_OPTIONS } from "@/lib/tasks/format";
import { TaskAttachmentPicker } from "./TaskAttachments";
import styles from "./TaskForm.module.css";

export type TaskFormValues = {
  title: string;
  description: string;
  dueDate: string;
  status: TaskStatus;
  assigneeIds: string[];
};

type TeamMemberOption = { id: string; name: string };

type TaskFormProps = {
  initial?: Partial<TaskFormValues>;
  teamMembers: TeamMemberOption[];
  submitLabel: string;
  isEditing?: boolean;
  onSubmit: (values: TaskFormValues, files?: File[]) => Promise<void>;
  onCancel: () => void;
};

const DEFAULT: TaskFormValues = {
  title: "",
  description: "",
  dueDate: "",
  status: "new",
  assigneeIds: [],
};

export function TaskForm({
  initial,
  teamMembers,
  submitLabel,
  isEditing = false,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const [values, setValues] = useState<TaskFormValues>({
    ...DEFAULT,
    ...initial,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.title.trim()) {
      setError("Укажите название задачи");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onSubmit(values, pendingFiles.length ? pendingFiles : undefined);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось сохранить задачу";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
      <label className={styles.field}>
        <span className={styles.label}>Название задачи *</span>
        <input
          className={styles.input}
          value={values.title}
          onChange={(e) => setValues({ ...values, title: e.target.value })}
          placeholder="Например: Подготовить обновление по Хорватии"
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Описание</span>
        <textarea
          className={styles.textarea}
          value={values.description}
          onChange={(e) =>
            setValues({ ...values, description: e.target.value })
          }
          rows={4}
          placeholder="Детали задачи…"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Срок выполнения</span>
        <input
          type="date"
          className={styles.input}
          value={values.dueDate}
          onChange={(e) => setValues({ ...values, dueDate: e.target.value })}
        />
      </label>

      <TaskAttachmentPicker
        files={pendingFiles}
        onChange={setPendingFiles}
        disabled={loading}
      />

      <fieldset className={styles.field}>
        <legend className={styles.label}>Исполнители</legend>
        <p className={styles.hint}>
          Можно выбрать одного или нескольких. Назначенные смогут менять статус
          задачи.
        </p>
        <div className={styles.assigneeList}>
          {teamMembers.map((member) => {
            const checked = values.assigneeIds.includes(member.id);
            return (
              <label key={member.id} className={styles.assigneeItem}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setValues((prev) => ({
                      ...prev,
                      assigneeIds: e.target.checked
                        ? [...prev.assigneeIds, member.id]
                        : prev.assigneeIds.filter((id) => id !== member.id),
                    }));
                  }}
                />
                <span>{member.name}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {!isEditing ? (
        <label className={styles.field}>
          <span className={styles.label}>Статус</span>
          <select
            className={styles.select}
            value={values.status}
            onChange={(e) =>
              setValues({ ...values, status: e.target.value as TaskStatus })
            }
          >
            {TASK_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className={styles.hint}>
          Статус меняется через действия «В работе», «На проверку» и согласование автором.
        </p>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function taskToFormValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description,
    dueDate: task.dueDate ?? "",
    status:
      task.status === "new" || task.status === "in_progress"
        ? task.status
        : "in_progress",
    assigneeIds: task.assignees.map((assignee) => assignee.id),
  };
}
