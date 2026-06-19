"use client";

import { useState } from "react";
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
import {
  formatReviewActionLabel,
  getLatestRevisionComment,
} from "@/lib/tasks/workflow";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { TaskAttachmentsSection } from "./TaskAttachments";
import styles from "./TaskDetailModal.module.css";

type TaskDetailModalProps = {
  task: Task;
  user: SessionUser;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStartTask: (task: Task) => void;
  onComplete: (task: Task) => void;
  onSubmitForApproval: (task: Task) => void;
  onApprove: (task: Task) => void;
  onRequestRevision: (task: Task, comment: string) => void;
  onTaskUpdated?: (task: Task) => void;
  workflowLoading?: boolean;
};

export function TaskDetailModal({
  task,
  user,
  onClose,
  onEdit,
  onDelete,
  onStartTask,
  onComplete,
  onSubmitForApproval,
  onApprove,
  onRequestRevision,
  onTaskUpdated,
  workflowLoading = false,
}: TaskDetailModalProps) {
  const [revisionComment, setRevisionComment] = useState("");
  const [revisionError, setRevisionError] = useState("");

  const overdue = isTaskOverdue(task);
  const isCompleted = task.status === "completed";
  const isPendingApproval = task.status === "pending_approval";
  const isNeedsRevision = task.status === "needs_revision";
  const createdByMe = isTaskCreator(task, user);
  const assignedToMe = isTaskAssignee(task, user.id);
  const canEdit = canEditTask(task, user);
  const canDelete = canDeleteTask(task, user);
  const canStart = canStartTask(task, user);
  const canSubmit = canSubmitForApproval(task, user);
  const canCompleteDirect = canDirectComplete(task, user);
  const canReview = canReviewTask(task, user);
  const latestRevision = getLatestRevisionComment(task);

  function handleRequestRevision() {
    const trimmed = revisionComment.trim();
    if (!trimmed) {
      setRevisionError("Добавьте комментарий для исполнителя");
      return;
    }
    setRevisionError("");
    onRequestRevision(task, trimmed);
    setRevisionComment("");
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <Card
        className={[
          styles.modal,
          isCompleted ? styles.modalCompleted : "",
          isPendingApproval ? styles.modalPending : "",
          isNeedsRevision ? styles.modalRevision : "",
          overdue ? styles.modalOverdue : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <header className={styles.header}>
          <div className={styles.headerMain}>
            {overdue ? <span className={styles.overdueTag}>Просрочена</span> : null}
            {isCompleted ? (
              <span className={styles.completedTag}>Принята</span>
            ) : null}
            {isPendingApproval && createdByMe ? (
              <span className={styles.pendingTag}>Ждёт вашего решения</span>
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
            Задача принята и завершена
            {task.completedAt ? ` · ${formatTaskDateTime(task.completedAt)}` : ""}.
            Можно удалить её из списка.
          </p>
        ) : null}

        {isPendingApproval && createdByMe ? (
          <p className={styles.pendingNotice}>
            Исполнитель сдал задачу на проверку. Примите работу или отправьте на доработку с
            комментарием.
          </p>
        ) : null}

        {isNeedsRevision && assignedToMe && latestRevision ? (
          <div className={styles.revisionBox}>
            <strong>Комментарий автора</strong>
            <p>{latestRevision}</p>
          </div>
        ) : null}

        {task.description ? (
          <p className={[styles.description, isCompleted ? styles.textMuted : ""].join(" ")}>
            {task.description}
          </p>
        ) : (
          <p className={styles.noDescription}>Описание не указано.</p>
        )}

        <TaskAttachmentsSection
          task={task}
          user={user}
          onTaskUpdated={onTaskUpdated}
        />

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
              <dt>Принято</dt>
              <dd>{formatTaskDateTime(task.completedAt)}</dd>
            </div>
          ) : null}
        </dl>

        {task.reviewHistory.length > 0 ? (
          <section className={styles.history}>
            <h3 className={styles.historyTitle}>История согласования</h3>
            <ol className={styles.historyList}>
              {[...task.reviewHistory].reverse().map((event) => (
                <li key={event.id} className={styles.historyItem}>
                  <div className={styles.historyHead}>
                    <span className={styles.historyAction}>
                      {formatReviewActionLabel(event.action)}
                    </span>
                    <time className={styles.historyTime}>
                      {formatTaskDateTime(event.createdAt)}
                    </time>
                  </div>
                  <p className={styles.historyMeta}>
                    {event.actorName}
                    {event.comment ? ` · «${event.comment}»` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {canReview ? (
          <section className={styles.reviewPanel}>
            <h3 className={styles.reviewTitle}>Проверка задачи</h3>
            <div className={styles.reviewActions}>
              <Button
                type="button"
                onClick={() => onApprove(task)}
                disabled={workflowLoading}
              >
                ✅ Принять задачу
              </Button>
            </div>
            <label className={styles.revisionField}>
              <span>Комментарий для доработки</span>
              <textarea
                className={styles.revisionInput}
                rows={3}
                value={revisionComment}
                onChange={(e) => {
                  setRevisionComment(e.target.value);
                  if (revisionError) setRevisionError("");
                }}
                placeholder="Что нужно исправить или уточнить…"
              />
            </label>
            {revisionError ? (
              <p className={styles.revisionError}>{revisionError}</p>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={handleRequestRevision}
              disabled={workflowLoading}
            >
              🔄 Отправить на доработку
            </Button>
          </section>
        ) : null}

        {!isCompleted && !isPendingApproval ? (
          <div className={styles.statusActions}>
            <span className={styles.statusActionsLabel}>Действия исполнителя:</span>
            <div className={styles.statusButtons}>
              {canStart ? (
                <Button
                  type="button"
                  variant="ghost"
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
                  onClick={() => onSubmitForApproval(task)}
                  disabled={workflowLoading}
                >
                  ✅ Сдать на проверку
                </Button>
              ) : null}
              {canCompleteDirect ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onComplete(task)}
                  disabled={workflowLoading}
                >
                  ✅ Выполнено
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={styles.actions}>
          {canEdit && !isPendingApproval ? (
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
