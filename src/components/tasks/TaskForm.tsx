"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { TASK_STATUS_OPTIONS } from "@/lib/tasks/format";
import styles from "./TaskForm.module.css";

export type TaskFormValues = {
  title: string;
  description: string;
  dueDate: string;
  status: TaskStatus;
};

type TaskFormProps = {
  initial?: Partial<TaskFormValues>;
  submitLabel: string;
  onSubmit: (values: TaskFormValues) => Promise<void>;
  onCancel: () => void;
};

const DEFAULT: TaskFormValues = {
  title: "",
  description: "",
  dueDate: "",
  status: "new",
};

export function TaskForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const [values, setValues] = useState<TaskFormValues>({
    ...DEFAULT,
    ...initial,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.title.trim()) {
      setError("Укажите название задачи");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onSubmit(values);
    } catch {
      setError("Не удалось сохранить задачу");
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
    status: task.status,
  };
}
