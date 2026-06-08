"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { SessionUser } from "@/lib/auth/types";
import { formatTaskDate, formatTaskDateTime } from "@/lib/tasks/format";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { TaskStatusBadge } from "./TaskStatusBadge";
import styles from "./TaskCard.module.css";

type TaskCardProps = {
  task: Task;
  user: SessionUser;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
};

export function TaskCard({
  task,
  user,
  onStatusChange,
  onEdit,
  onDelete,
}: TaskCardProps) {
  const isCompleted = task.status === "completed";
  const canEdit = user.role === "owner" || task.createdByUserId === user.id;
  const canDelete = canEdit;

  return (
    <Card
      className={[
        styles.card,
        task.status === "new" ? styles.statusNew : "",
        task.status === "in_progress" ? styles.statusInProgress : "",
        isCompleted ? styles.completed : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.header}>
        <h3
          className={[styles.title, isCompleted ? styles.titleDone : ""].join(
            " ",
          )}
        >
          {task.title}
        </h3>
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
          <dt>Создано</dt>
          <dd>{formatTaskDateTime(task.createdAt)}</dd>
        </div>
        <div>
          <dt>Срок</dt>
          <dd>{formatTaskDate(task.dueDate)}</dd>
        </div>
        {isCompleted && task.completedAt ? (
          <div>
            <dt>Выполнено</dt>
            <dd>{formatTaskDateTime(task.completedAt)}</dd>
          </div>
        ) : null}
      </dl>

      {!isCompleted ? (
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
