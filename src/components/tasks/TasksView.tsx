"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { SessionUser } from "@/lib/auth/types";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { TaskCard } from "./TaskCard";
import { TaskForm, taskToFormValues, type TaskFormValues } from "./TaskForm";
import { Toast, type ToastMessage } from "./Toast";
import styles from "./TasksView.module.css";

type AuthorOption = { id: string; name: string };

type TasksViewProps = {
  user: SessionUser;
  authors: AuthorOption[];
};

type StatusFilter = "all" | TaskStatus;

export function TasksView({ user, authors }: TasksViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { tasks?: Task[] };
      setTasks(data.tasks ?? []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const created = searchParams.get("created");
    const completed = searchParams.get("completed");
    const deleted = searchParams.get("deleted");
    if (created === "1") {
      setToast({ text: "Задача успешно создана." });
      router.replace("/tasks");
    } else if (completed === "1") {
      setToast({ text: "Задача отмечена выполненной." });
      router.replace("/tasks");
    } else if (deleted === "1") {
      setToast({ text: "Задача удалена." });
      router.replace("/tasks");
    }
  }, [searchParams, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }
      if (authorFilter !== "all" && task.createdByUserId !== authorFilter) {
        return false;
      }
      if (!q) return true;
      const hay = `${task.title} ${task.description} ${task.createdByName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [tasks, search, statusFilter, authorFilter]);

  async function handleCreate(values: TaskFormValues) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        dueDate: values.dueDate || null,
        status: values.status,
      }),
    });
    if (!res.ok) throw new Error("create failed");
    setCreateOpen(false);
    setToast({ text: "Задача успешно создана." });
    await fetchTasks();
  }

  async function handleUpdate(values: TaskFormValues) {
    if (!editTask) return;
    const res = await fetch(`/api/tasks/${encodeURIComponent(editTask.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        dueDate: values.dueDate || null,
        status: values.status,
      }),
    });
    if (!res.ok) throw new Error("update failed");
    setEditTask(null);
    setToast({ text: "Задача обновлена." });
    await fetchTasks();
  }

  async function handleStatusChange(task: Task, status: TaskStatus) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_status", status }),
    });
    if (!res.ok) return;

    if (status === "completed") {
      setToast({ text: "Задача отмечена выполненной." });
    } else if (status === "in_progress") {
      setToast({ text: "Задача в работе." });
    } else {
      setToast({ text: "Статус задачи обновлён." });
    }

    await fetchTasks();
  }

  async function confirmDelete() {
    if (!deleteTask) return;
    const res = await fetch(`/api/tasks/${encodeURIComponent(deleteTask.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setToast({ text: "Не удалось удалить задачу", type: "error" });
      return;
    }
    setDeleteTask(null);
    setToast({ text: "Задача удалена." });
    await fetchTasks();
  }

  return (
    <div className={styles.wrap}>
      <SectionHeader
        title="Задачи команды"
        subtitle="Общий список задач Sharp & Spice"
        action={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            ➕ Новая задача
          </Button>
        }
      />

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder="Поиск по названию, описанию, автору…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.select}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">Все статусы</option>
          <option value="new">Новые</option>
          <option value="in_progress">В работе</option>
          <option value="completed">Выполненные</option>
        </select>
        <select
          className={styles.select}
          value={authorFilter}
          onChange={(e) => setAuthorFilter(e.target.value)}
        >
          <option value="all">Все сотрудники</option>
          {authors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className={styles.empty}>Загрузка задач…</p>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>
          {tasks.length === 0
            ? "Пока нет задач. Создайте первую — её увидит вся команда."
            : "Ничего не найдено по фильтрам."}
        </p>
      ) : (
        <ul className={styles.list}>
          {filtered.map((task) => (
            <li key={task.id}>
              <TaskCard
                task={task}
                user={user}
                onStatusChange={(t, status) => void handleStatusChange(t, status)}
                onEdit={setEditTask}
                onDelete={setDeleteTask}
              />
            </li>
          ))}
        </ul>
      )}

      {createOpen && (
        <Modal title="Новая задача" onClose={() => setCreateOpen(false)}>
          <TaskForm
            submitLabel="Создать"
            onCancel={() => setCreateOpen(false)}
            onSubmit={handleCreate}
          />
        </Modal>
      )}

      {editTask && (
        <Modal title="Редактировать задачу" onClose={() => setEditTask(null)}>
          <TaskForm
            initial={taskToFormValues(editTask)}
            submitLabel="Сохранить"
            onCancel={() => setEditTask(null)}
            onSubmit={handleUpdate}
          />
        </Modal>
      )}

      {deleteTask && (
        <Modal title="Удалить задачу?" onClose={() => setDeleteTask(null)}>
          <p className={styles.confirmText}>Вы уверены?</p>
          <p className={styles.confirmTask}>{deleteTask.title}</p>
          <div className={styles.confirmActions}>
            <Button type="button" variant="secondary" onClick={() => setDeleteTask(null)}>
              Отмена
            </Button>
            <Button type="button" variant="danger" onClick={() => void confirmDelete()}>
              Удалить
            </Button>
          </div>
        </Modal>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <Card className={styles.modal}>
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        {children}
      </Card>
    </div>
  );
}
