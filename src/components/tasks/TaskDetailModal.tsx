"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { SessionUser } from "@/lib/auth/types";
import { formatAssigneeNames } from "@/lib/tasks/assignees";
import { formatTaskDate, formatTaskDateTime } from "@/lib/tasks/format";
import { isTaskOverdue } from "@/lib/tasks/overdue";
import {
  canChangeTaskStatus,
  canDeleteTask,
  canEditTask,
  isTaskAssignee,
} from "@/lib/tasks/permissions";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { TaskStatusBadge } from "./TaskStatusBadge";
import styles from "./TaskDetailModal.module.css";

type TaskDetailModalProps = {
  task: Task;
  user: SessionUser;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
};

export function TaskDetailModal({
  task,
  user,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
}: TaskDetailModalProps) {
  const overdue = isTaskOverdue(task);
  const isCompleted = task.status === "completed";
  const createdByMe = task.createdByUserId === user.id;
  const assignedToMe = isTaskAssignee(task, user.id);
  const canEdit = canEditTask(task, user);
  const canDelete = canDeleteTask(task, user);
  const canChangeStatus = canChangeTaskStatus(task, user);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <Card
        className={[
          styles.modal,
          isCompleted ? styles.modalCompleted : "",
          overdue ? styles.modalOverdue : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <header className={styles.header}>
          <div className={styles.headerMain}>
            {overdue ? <span className={styles.overdueTag}>Просрочена</span> : null}
            {isCompleted ? (
              <span className={styles.completedTag}>Выполнена</span>
            ) : null}
            <h2
              id="task-detail-title"
              className={[styles.title, isCompleted ? styles.titleDone : ""].join(" ")}
            >
              {task.title}
            </h2>
            <TaskStatusBadge status={task.status} />
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        {isCompleted && createdByMe && !assignedToMe ? (
          <p className={styles.completedNotice}>
            Задача, которую вы поставили, выполнена исполнителем
            {task.completedAt ? ` · ${formatTaskDateTime(task.completedAt)}` : ""}.
          </p>
        ) : null}

        {task.description ? (
          <p className={[styles.description, isCompleted ? styles.textMuted : ""].join(" ")}>
            {task.description}
          </p>
        ) : (
          <p className={styles.noDescription}>Описание не указано.</p>
        )}

        <dl className={styles.meta}>
          <div>
            <dt>Автор</dt>
            <dd>{task.createdByName}</dd>
          </div>
          <div>
            <dt>Исполнители</dt>
            <dd>{formatAssigneeNames(task.assignees)}</dd>
          </div>
          <div>
            <dt>Создано</dt>
            <dd>{formatTaskDateTime(task.createdAt)}</dd>
          </div>
          <div>
            <dt>Срок</dt>
            <dd className={overdue ? styles.dueOverdue : ""}>{formatTaskDate(task.dueDate)}</dd>
          </div>
          {isCompleted && task.completedAt ? (
            <div>
              <dt>Выполнено</dt>
              <dd>{formatTaskDateTime(task.completedAt)}</dd>
            </div>
          ) : null}
        </dl>

        {!isCompleted && canChangeStatus ? (
          <div className={styles.statusActions}>
            <span className={styles.statusActionsLabel}>Сменить статус:</span>
            <div className={styles.statusButtons}>
              {task.status === "new" ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onStatusChange(task, "in_progress")}
                >
                  ▶ В работе
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => onStatusChange(task, "completed")}
              >
                ✅ Выполнено
              </Button>
            </div>
          </div>
        ) : null}

        <div className={styles.actions}>
          {canEdit ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onClose();
                onEdit(task);
              }}
            >
              ✏️ Редактировать
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                onClose();
                onDelete(task);
              }}
            >
              🗑 Удалить
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </Card>
    </div>
  );
}
