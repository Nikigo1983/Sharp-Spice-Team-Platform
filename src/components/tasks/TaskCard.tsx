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
import styles from "./TaskCard.module.css";

type TaskCardProps = {
  task: Task;
  user: SessionUser;
  highlighted?: boolean;
  onOpen: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
};

export function TaskCard({
  task,
  user,
  highlighted = false,
  onOpen,
  onStatusChange,
  onEdit,
  onDelete,
}: TaskCardProps) {
  const isCompleted = task.status === "completed";
  const overdue = isTaskOverdue(task);
  const createdByMe = task.createdByUserId === user.id;
  const assignedToMe = isTaskAssignee(task, user.id);
  const canEdit = canEditTask(task, user);
  const canDelete = canDeleteTask(task, user);
  const canChangeStatus = canChangeTaskStatus(task, user);

  return (
    <Card
      className={[
        styles.card,
        task.status === "new" ? styles.statusNew : "",
        task.status === "in_progress" ? styles.statusInProgress : "",
        isCompleted ? styles.completed : "",
        overdue ? styles.overdue : "",
        highlighted ? styles.highlighted : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {overdue ? <div className={styles.overdueBanner}>Просрочена</div> : null}
      {isCompleted ? (
        <div className={styles.completedBanner}>
          {createdByMe && !assignedToMe
            ? `Выполнена исполнителем${
                task.completedAt ? ` · ${formatTaskDateTime(task.completedAt)}` : ""
              }`
            : `Выполнена${
                task.completedAt ? ` · ${formatTaskDateTime(task.completedAt)}` : ""
              }`}
        </div>
      ) : null}

      <div className={styles.header}>
        <button
          type="button"
          className={styles.titleButton}
          onClick={() => onOpen(task)}
        >
          <h3
            className={[styles.title, isCompleted ? styles.titleDone : ""].join(
              " ",
            )}
          >
            {task.title}
          </h3>
        </button>
        <TaskStatusBadge status={task.status} />
      </div>

      {task.description ? (
        <p
          className={[
            styles.description,
            isCompleted ? styles.textMuted : "",
          ].join(" ")}
        >
          {task.description}
        </p>
      ) : null}

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
          <dd className={overdue ? styles.dueOverdue : ""}>
            {formatTaskDate(task.dueDate)}
          </dd>
        </div>
        {isCompleted && task.completedAt ? (
          <div>
            <dt>Выполнено</dt>
            <dd className={styles.completedAt}>{formatTaskDateTime(task.completedAt)}</dd>
          </div>
        ) : null}
      </dl>

      {!isCompleted && canChangeStatus ? (
        <div className={styles.statusActions}>
          <span className={styles.statusActionsLabel}>Быстрый статус:</span>
          <div className={styles.statusButtons}>
            {task.status === "new" ? (
              <Button
                type="button"
                variant="ghost"
                className={styles.statusBtnInProgress}
                onClick={() => onStatusChange(task, "in_progress")}
              >
                ▶ В работе
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className={styles.statusBtnComplete}
              onClick={() => onStatusChange(task, "completed")}
            >
              ✅ Выполнено
            </Button>
          </div>
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={() => onOpen(task)}>
          Открыть
        </Button>
        {canEdit ? (
          <Button type="button" variant="secondary" onClick={() => onEdit(task)}>
            ✏️ Редактировать
          </Button>
        ) : null}
        {canDelete ? (
          <Button type="button" variant="danger" onClick={() => onDelete(task)}>
            🗑 Удалить
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
