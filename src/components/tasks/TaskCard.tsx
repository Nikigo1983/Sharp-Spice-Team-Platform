"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { SessionUser } from "@/lib/auth/types";
import { formatAssigneeNames } from "@/lib/tasks/assignees";
import { formatTaskDate, formatTaskDateTime } from "@/lib/tasks/format";
import { isTaskOverdue } from "@/lib/tasks/overdue";
import {
  canDirectComplete,
  canDeleteTask,
  canEditTask,
  canReviewTask,
  canStartTask,
  canSubmitForApproval,
  isTaskAssignee,
  isTaskCreator,
} from "@/lib/tasks/permissions";
import type { Task } from "@/lib/tasks/types";
import { getLatestRevisionComment } from "@/lib/tasks/workflow";
import { TaskStatusBadge } from "./TaskStatusBadge";
import styles from "./TaskCard.module.css";

type TaskCardProps = {
  task: Task;
  user: SessionUser;
  highlighted?: boolean;
  workflowLoading?: boolean;
  onOpen: (task: Task) => void;
  onStartTask: (task: Task) => void;
  onComplete: (task: Task) => void;
  onSubmitForApproval: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
};

export function TaskCard({
  task,
  user,
  highlighted = false,
  workflowLoading = false,
  onOpen,
  onStartTask,
  onComplete,
  onSubmitForApproval,
  onEdit,
  onDelete,
}: TaskCardProps) {
  const isCompleted = task.status === "completed";
  const isPendingApproval = task.status === "pending_approval";
  const isNeedsRevision = task.status === "needs_revision";
  const overdue = isTaskOverdue(task);
  const createdByMe = isTaskCreator(task, user);
  const assignedToMe = isTaskAssignee(task, user.id);
  const canEdit = canEditTask(task, user);
  const canDelete = canDeleteTask(task, user);
  const canStart = canStartTask(task, user);
  const canSubmit = canSubmitForApproval(task, user);
  const canCompleteDirect = canDirectComplete(task, user);
  const canReview = canReviewTask(task, user);
  const latestRevision = getLatestRevisionComment(task);

  return (
    <Card
      className={[
        styles.card,
        task.status === "new" ? styles.statusNew : "",
        task.status === "in_progress" ? styles.statusInProgress : "",
        isPendingApproval ? styles.statusPending : "",
        isNeedsRevision ? styles.statusRevision : "",
        isCompleted ? styles.completed : "",
        overdue ? styles.overdue : "",
        highlighted ? styles.highlighted : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {overdue ? <div className={styles.overdueBanner}>Просрочена</div> : null}
      {isPendingApproval && createdByMe ? (
        <div className={styles.pendingBanner}>На вашей проверке</div>
      ) : null}
      {isNeedsRevision && assignedToMe ? (
        <div className={styles.revisionBanner}>Нужна доработка</div>
      ) : null}
      {isCompleted ? (
        <div className={styles.completedBanner}>
          {createdByMe && !assignedToMe
            ? `Принята${
                task.completedAt ? ` · ${formatTaskDateTime(task.completedAt)}` : ""
              }`
            : `Завершена${
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

      {isNeedsRevision && latestRevision ? (
        <p className={styles.revisionPreview}>
          <strong>Комментарий:</strong> {latestRevision}
        </p>
      ) : null}

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
            <dt>Принято</dt>
            <dd className={styles.completedAt}>{formatTaskDateTime(task.completedAt)}</dd>
          </div>
        ) : null}
      </dl>

      {!isCompleted && !isPendingApproval ? (
        <div className={styles.statusActions}>
          <span className={styles.statusActionsLabel}>Быстрые действия:</span>
          <div className={styles.statusButtons}>
            {canStart ? (
              <Button
                type="button"
                variant="ghost"
                className={styles.statusBtnInProgress}
                onClick={() => onStartTask(task)}
                disabled={workflowLoading}
              >
                ▶ В работе
              </Button>
            ) : null}
            {canSubmit ? (
              <Button
                type="button"
                variant="ghost"
                className={styles.statusBtnComplete}
                onClick={() => onSubmitForApproval(task)}
                disabled={workflowLoading}
              >
                ✅ На проверку
              </Button>
            ) : null}
            {canCompleteDirect ? (
              <Button
                type="button"
                variant="ghost"
                className={styles.statusBtnComplete}
                onClick={() => onComplete(task)}
                disabled={workflowLoading}
              >
                ✅ Выполнено
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {canReview ? (
        <div className={styles.reviewHint}>
          Откройте задачу, чтобы принять или отправить на доработку.
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={() => onOpen(task)}>
          Открыть
        </Button>
        {canEdit && !isPendingApproval ? (
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
