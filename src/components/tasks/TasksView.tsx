"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { SessionUser } from "@/lib/auth/types";
import { isTaskOverdue } from "@/lib/tasks/overdue";
import { formatTaskDate } from "@/lib/tasks/format";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { TaskCard } from "./TaskCard";
import { TaskDetailModal } from "./TaskDetailModal";
import { TaskForm, taskToFormValues, type TaskFormValues } from "./TaskForm";
import { Toast, type ToastMessage } from "./Toast";
import styles from "./TasksView.module.css";

type TeamMemberOption = { id: string; name: string };

type TasksViewProps = {
  user: SessionUser;
  teamMembers: TeamMemberOption[];
};

type StatusFilter = "all" | TaskStatus;
type QuickFilter = "all" | "overdue" | "created_by_me" | "completed";

export function TasksView({ user, teamMembers }: TasksViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [viewTask, setViewTask] = useState<Task | null>(null);
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

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
    const overdue = searchParams.get("overdue");
    const status = searchParams.get("status");
    const createdByMe = searchParams.get("created_by_me");
    const taskId = searchParams.get("task");

    if (overdue === "1") {
      setQuickFilter("overdue");
    } else if (createdByMe === "1") {
      setQuickFilter("created_by_me");
    } else if (status === "completed") {
      setQuickFilter("completed");
      setStatusFilter("completed");
    } else if (status === "in_progress") {
      setStatusFilter("in_progress");
      setQuickFilter("all");
    }

    if (taskId) {
      setFocusTaskId(taskId);
    }

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

  useEffect(() => {
    if (!focusTaskId || tasks.length === 0) return;
    const task = tasks.find((item) => item.id === focusTaskId);
    if (task) {
      setViewTask(task);
      setFocusTaskId(null);
    }
  }, [focusTaskId, tasks]);

  const overdueTasks = useMemo(
    () => tasks.filter((task) => isTaskOverdue(task)),
    [tasks],
  );

  const assignedByMeCompleted = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.createdByUserId === user.id &&
          task.status === "completed" &&
          !task.assignees.some((assignee) => assignee.id === user.id),
      ),
    [tasks, user.id],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (quickFilter === "overdue" && !isTaskOverdue(task)) {
        return false;
      }
      if (quickFilter === "created_by_me" && task.createdByUserId !== user.id) {
        return false;
      }
      if (quickFilter === "completed" && task.status !== "completed") {
        return false;
      }
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }
      if (authorFilter !== "all" && task.createdByUserId !== authorFilter) {
        return false;
      }
      if (
        assigneeFilter !== "all" &&
        !task.assignees.some((assignee) => assignee.id === assigneeFilter)
      ) {
        return false;
      }
      if (!q) return true;
      const assigneeNames = task.assignees.map((assignee) => assignee.name).join(" ");
      const hay =
        `${task.title} ${task.description} ${task.createdByName} ${assigneeNames}`.toLowerCase();
      return hay.includes(q);
    });
  }, [tasks, search, statusFilter, authorFilter, assigneeFilter, quickFilter, user.id]);

  function applyQuickFilter(filter: QuickFilter) {
    setQuickFilter(filter);
    if (filter === "completed") {
      setStatusFilter("completed");
    } else if (filter === "all") {
      setStatusFilter("all");
    } else if (filter !== "overdue") {
      setStatusFilter("all");
    }
  }

  function openTask(task: Task) {
    setViewTask(task);
    router.replace(`/tasks?task=${encodeURIComponent(task.id)}`, { scroll: false });
  }

  function closeTaskView() {
    setViewTask(null);
    router.replace("/tasks", { scroll: false });
  }

  async function handleCreate(values: TaskFormValues) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        dueDate: values.dueDate || null,
        status: values.status,
        assigneeIds: values.assigneeIds,
      }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Не удалось сохранить задачу");
    }
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
        assigneeIds: values.assigneeIds,
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
    if (!res.ok) {
      setToast({
        text:
          res.status === 403
            ? "Недостаточно прав для смены статуса."
            : "Не удалось обновить статус.",
        type: "error",
      });
      return;
    }

    if (status === "completed") {
      setToast({ text: "Задача отмечена выполненной." });
    } else if (status === "in_progress") {
      setToast({ text: "Задача в работе." });
    } else {
      setToast({ text: "Статус задачи обновлён." });
    }

    setViewTask(null);
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
    setViewTask(null);
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

      {!loading && overdueTasks.length > 0 ? (
        <Card className={styles.overdueAlert}>
          <div className={styles.overdueAlertHeader}>
            <strong>
              Просрочено задач: {overdueTasks.length}
            </strong>
            {quickFilter !== "overdue" ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => applyQuickFilter("overdue")}
              >
                Показать только просроченные
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => applyQuickFilter("all")}
              >
                Показать все
              </Button>
            )}
          </div>
          <ul className={styles.overdueList}>
            {overdueTasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  className={styles.overdueLink}
                  onClick={() => openTask(task)}
                >
                  <span className={styles.overdueTitle}>{task.title}</span>
                  <span className={styles.overdueMeta}>
                    Срок: {formatTaskDate(task.dueDate)} · {task.createdByName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {!loading && assignedByMeCompleted.length > 0 ? (
        <Card className={styles.completedAlert}>
          <p className={styles.completedAlertText}>
            Выполнено задач, которые вы поставили другим:{" "}
            <strong>{assignedByMeCompleted.length}</strong>
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => applyQuickFilter("created_by_me")}
          >
            Показать назначенные мной
          </Button>
        </Card>
      ) : null}

      <div className={styles.quickFilters}>
        <button
          type="button"
          className={[styles.quickFilter, quickFilter === "all" ? styles.quickFilterActive : ""].join(" ")}
          onClick={() => applyQuickFilter("all")}
        >
          Все
        </button>
        <button
          type="button"
          className={[styles.quickFilter, quickFilter === "overdue" ? styles.quickFilterActive : ""].join(" ")}
          onClick={() => applyQuickFilter("overdue")}
        >
          Просроченные{overdueTasks.length > 0 ? ` (${overdueTasks.length})` : ""}
        </button>
        <button
          type="button"
          className={[styles.quickFilter, quickFilter === "created_by_me" ? styles.quickFilterActive : ""].join(" ")}
          onClick={() => applyQuickFilter("created_by_me")}
        >
          Назначенные мной
        </button>
        <button
          type="button"
          className={[styles.quickFilter, quickFilter === "completed" ? styles.quickFilterActive : ""].join(" ")}
          onClick={() => applyQuickFilter("completed")}
        >
          Выполненные
        </button>
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder="Поиск по названию, описанию, автору, исполнителю…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.select}
          value={statusFilter}
          onChange={(e) => {
            const value = e.target.value as StatusFilter;
            setStatusFilter(value);
            if (value === "completed") {
              setQuickFilter("completed");
            } else if (quickFilter === "completed") {
              setQuickFilter("all");
            }
          }}
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
          <option value="all">Все авторы</option>
          {teamMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
        >
          <option value="all">Все исполнители</option>
          {teamMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
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
                highlighted={viewTask?.id === task.id || isTaskOverdue(task)}
                onOpen={openTask}
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
            teamMembers={teamMembers}
            submitLabel="Создать"
            onCancel={() => setCreateOpen(false)}
            onSubmit={handleCreate}
          />
        </Modal>
      )}

      {viewTask ? (
        <TaskDetailModal
          task={viewTask}
          user={user}
          onClose={closeTaskView}
          onEdit={setEditTask}
          onDelete={setDeleteTask}
          onStatusChange={(t, status) => void handleStatusChange(t, status)}
        />
      ) : null}

      {editTask && (
        <Modal title="Редактировать задачу" onClose={() => setEditTask(null)}>
          <TaskForm
            initial={taskToFormValues(editTask)}
            teamMembers={teamMembers}
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
