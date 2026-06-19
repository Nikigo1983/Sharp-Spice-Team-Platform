"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useNotificationsOptional } from "@/components/notifications/notification-context";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { SessionUser } from "@/lib/auth/types";
import { isTaskCreator, isTaskAssignee } from "@/lib/tasks/permissions";
import { isTaskOverdue } from "@/lib/tasks/overdue";
import { formatTaskDate, TASK_FILTER_STATUS_OPTIONS } from "@/lib/tasks/format";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { TaskCard } from "./TaskCard";
import { TaskDetailModal } from "./TaskDetailModal";
import { uploadTaskFiles } from "./TaskAttachments";
import { TaskForm, taskToFormValues, type TaskFormValues } from "./TaskForm";
import { Toast, type ToastMessage } from "./Toast";
import styles from "./TasksView.module.css";

type TeamMemberOption = { id: string; name: string };

type TasksViewProps = {
  user: SessionUser;
  teamMembers: TeamMemberOption[];
};

type StatusFilter = "all" | TaskStatus;
type QuickFilter = "all" | "overdue" | "created_by_me" | "pending_review" | "needs_my_revision" | "completed";

export function TasksView({ user, teamMembers }: TasksViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notificationsCtx = useNotificationsOptional();
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
  const [workflowLoading, setWorkflowLoading] = useState(false);

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

  const pendingMyReview = useMemo(
    () =>
      tasks.filter(
        (task) => isTaskCreator(task, user) && task.status === "pending_approval",
      ),
    [tasks, user],
  );

  const needsMyRevision = useMemo(
    () =>
      tasks.filter(
        (task) => isTaskAssignee(task, user.id) && task.status === "needs_revision",
      ),
    [tasks, user.id],
  );

  const assignedByMeCompleted = useMemo(
    () =>
      tasks.filter(
        (task) =>
          isTaskCreator(task, user) &&
          task.status === "completed" &&
          !task.assignees.some((assignee) => assignee.id === user.id),
      ),
    [tasks, user.id],
  );

  const unreadPendingNotifications = useMemo(
    () =>
      (notificationsCtx?.notifications ?? []).filter(
        (item) =>
          (item.type === "task_pending_approval" ||
            item.type === "task_revision" ||
            item.type === "task_completed") &&
          !item.is_read,
      ),
    [notificationsCtx?.notifications],
  );

  const statusOptions = useMemo(() => TASK_FILTER_STATUS_OPTIONS, []);

  const authorOptions = useMemo(
    () => [
      { value: "all", label: "Все авторы" },
      ...teamMembers.map((member) => ({
        value: member.id,
        label: member.name,
      })),
    ],
    [teamMembers],
  );

  const assigneeOptions = useMemo(
    () => [
      { value: "all", label: "Все исполнители" },
      ...teamMembers.map((member) => ({
        value: member.id,
        label: member.name,
      })),
    ],
    [teamMembers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (quickFilter === "overdue" && !isTaskOverdue(task)) {
        return false;
      }
      if (quickFilter === "created_by_me" && !isTaskCreator(task, user)) {
        return false;
      }
      if (
        quickFilter === "pending_review" &&
        !(isTaskCreator(task, user) && task.status === "pending_approval")
      ) {
        return false;
      }
      if (
        quickFilter === "needs_my_revision" &&
        !(isTaskAssignee(task, user.id) && task.status === "needs_revision")
      ) {
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
    } else if (filter === "pending_review") {
      setStatusFilter("pending_approval");
    } else if (filter === "needs_my_revision") {
      setStatusFilter("needs_revision");
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

  async function handleCreate(values: TaskFormValues, files?: File[]) {
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

    const data = (await res.json()) as { task?: Task };
    if (data.task && files?.length) {
      try {
        await uploadTaskFiles(data.task.id, files);
      } catch (err) {
        setCreateOpen(false);
        setToast({
          text:
            err instanceof Error
              ? `Задача создана, но файлы не прикреплены: ${err.message}`
              : "Задача создана, но файлы не прикреплены.",
          type: "error",
        });
        await fetchTasks();
        return;
      }
    }

    setCreateOpen(false);
    setToast({ text: "Задача успешно создана." });
    await fetchTasks();
  }

  async function handleUpdate(values: TaskFormValues, files?: File[]) {
    if (!editTask) return;
    const res = await fetch(`/api/tasks/${encodeURIComponent(editTask.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        dueDate: values.dueDate || null,
        assigneeIds: values.assigneeIds,
      }),
    });
    if (!res.ok) throw new Error("update failed");

    if (files?.length) {
      await uploadTaskFiles(editTask.id, files);
    }

    setEditTask(null);
    setToast({ text: "Задача обновлена." });
    await fetchTasks();
  }

  function handleTaskUpdated(updated: Task) {
    setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setViewTask((prev) => (prev?.id === updated.id ? updated : prev));
  }

  async function runWorkflow(
    task: Task,
    action:
      | "set_status"
      | "complete"
      | "submit_for_approval"
      | "approve"
      | "request_revision",
    extra?: { status?: TaskStatus; comment?: string },
  ) {
    setWorkflowLoading(true);
    try {
      const body: Record<string, string> = { action };
      if (extra?.status) body.status = extra.status;
      if (extra?.comment) body.comment = extra.comment;

      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setToast({
          text:
            res.status === 403
              ? "Недостаточно прав для этого действия."
              : data.error === "Comment required"
                ? "Добавьте комментарий для доработки."
                : "Не удалось обновить задачу.",
          type: "error",
        });
        return;
      }

      const data = (await res.json()) as { task?: Task };
      if (data.task) setViewTask(data.task);

      switch (action) {
        case "submit_for_approval":
          setToast({ text: "Задача отправлена автору на проверку." });
          break;
        case "approve":
          setToast({ text: "Задача принята и завершена." });
          break;
        case "request_revision":
          setToast({ text: "Задача отправлена на доработку." });
          break;
        case "complete":
          setToast({ text: "Задача отмечена выполненной." });
          break;
        case "set_status":
          if (extra?.status === "in_progress") {
            setToast({ text: "Задача в работе." });
          } else {
            setToast({ text: "Статус задачи обновлён." });
          }
          break;
      }

      await fetchTasks();
    } finally {
      setWorkflowLoading(false);
    }
  }

  async function handleStartTask(task: Task) {
    await runWorkflow(task, "set_status", { status: "in_progress" });
  }

  async function handleComplete(task: Task) {
    await runWorkflow(task, "complete");
  }

  async function handleSubmitForApproval(task: Task) {
    await runWorkflow(task, "submit_for_approval");
  }

  async function handleApprove(task: Task) {
    await runWorkflow(task, "approve");
  }

  async function handleRequestRevision(task: Task, comment: string) {
    await runWorkflow(task, "request_revision", { comment });
  }

  async function confirmDelete() {
    if (!deleteTask) return;
    const res = await fetch(`/api/tasks/${encodeURIComponent(deleteTask.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setToast({
        text:
          res.status === 403
            ? "Удалить задачу может только тот, кто её назначил, или владелец платформы."
            : "Не удалось удалить задачу",
        type: "error",
      });
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

      {unreadPendingNotifications.length > 0 ? (
        <Card className={styles.completedNotificationAlert}>
          <div className={styles.completedNotificationHeader}>
            <strong>
              Уведомления по задачам: {unreadPendingNotifications.length}
            </strong>
            <Button
              type="button"
              variant="ghost"
              className={styles.completedNotificationDismiss}
              onClick={() => {
                void (async () => {
                  for (const item of unreadPendingNotifications) {
                    await notificationsCtx?.markRead(item.id);
                  }
                })();
              }}
            >
              Прочитать все
            </Button>
          </div>
          <ul className={styles.completedNotificationList}>
            {unreadPendingNotifications.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.completedNotificationItem}
                  onClick={() => void notificationsCtx?.markRead(item.id)}
                >
                  <span className={styles.completedNotificationTitle}>
                    {item.message}
                  </span>
                  {item.author_name ? (
                    <span className={styles.completedNotificationMeta}>
                      Исполнитель: {item.author_name}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

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

      {!loading && pendingMyReview.length > 0 ? (
        <Card className={styles.pendingAlert}>
          <p className={styles.pendingAlertText}>
            На вашей проверке: <strong>{pendingMyReview.length}</strong>
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => applyQuickFilter("pending_review")}
          >
            Показать задачи на проверке
          </Button>
        </Card>
      ) : null}

      {!loading && needsMyRevision.length > 0 ? (
        <Card className={styles.revisionAlert}>
          <p className={styles.revisionAlertText}>
            Нужна ваша доработка: <strong>{needsMyRevision.length}</strong>
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => applyQuickFilter("needs_my_revision")}
          >
            Показать задачи на доработке
          </Button>
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
          className={[styles.quickFilter, quickFilter === "pending_review" ? styles.quickFilterActive : ""].join(" ")}
          onClick={() => applyQuickFilter("pending_review")}
        >
          На проверке{pendingMyReview.length > 0 ? ` (${pendingMyReview.length})` : ""}
        </button>
        <button
          type="button"
          className={[styles.quickFilter, quickFilter === "needs_my_revision" ? styles.quickFilterActive : ""].join(" ")}
          onClick={() => applyQuickFilter("needs_my_revision")}
        >
          На доработке{needsMyRevision.length > 0 ? ` (${needsMyRevision.length})` : ""}
        </button>
        <button
          type="button"
          className={[styles.quickFilter, quickFilter === "completed" ? styles.quickFilterActive : ""].join(" ")}
          onClick={() => applyQuickFilter("completed")}
        >
          Принятые
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
        <div className={styles.filters}>
          <FilterSelect
            ariaLabel="Фильтр по статусу"
            value={statusFilter}
            options={statusOptions}
            onChange={(value) => {
              const next = value as StatusFilter;
              setStatusFilter(next);
              if (next === "completed") {
                setQuickFilter("completed");
              } else if (quickFilter === "completed") {
                setQuickFilter("all");
              }
            }}
          />
          <FilterSelect
            ariaLabel="Фильтр по автору"
            value={authorFilter}
            options={authorOptions}
            onChange={setAuthorFilter}
          />
          <FilterSelect
            ariaLabel="Фильтр по исполнителю"
            value={assigneeFilter}
            options={assigneeOptions}
            onChange={setAssigneeFilter}
          />
        </div>
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
                workflowLoading={workflowLoading}
                onOpen={openTask}
                onStartTask={(t) => void handleStartTask(t)}
                onComplete={(t) => void handleComplete(t)}
                onSubmitForApproval={(t) => void handleSubmitForApproval(t)}
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
          workflowLoading={workflowLoading}
          onClose={closeTaskView}
          onEdit={setEditTask}
          onDelete={setDeleteTask}
          onStartTask={(t) => void handleStartTask(t)}
          onComplete={(t) => void handleComplete(t)}
          onSubmitForApproval={(t) => void handleSubmitForApproval(t)}
          onApprove={(t) => void handleApprove(t)}
          onRequestRevision={(t, comment) => void handleRequestRevision(t, comment)}
          onTaskUpdated={handleTaskUpdated}
        />
      ) : null}

      {editTask && (
        <Modal title="Редактировать задачу" onClose={() => setEditTask(null)}>
          <TaskForm
            initial={taskToFormValues(editTask)}
            teamMembers={teamMembers}
            isEditing
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
