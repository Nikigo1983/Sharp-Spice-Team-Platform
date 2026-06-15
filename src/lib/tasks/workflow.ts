import type { Task, TaskReviewEvent } from "./types";

/** Задача требует согласования автором (есть исполнитель, отличный от автора). */
export function taskNeedsApprovalWorkflow(task: Task): boolean {
  if (task.assignees.length === 0) return false;
  const creatorId = task.createdByUserId?.trim();
  if (!creatorId) return task.assignees.length > 0;
  return task.assignees.some((assignee) => assignee.id !== creatorId);
}

export function getLatestRevisionComment(task: Task): string | null {
  for (let i = task.reviewHistory.length - 1; i >= 0; i--) {
    const event = task.reviewHistory[i];
    if (event.action === "revision_requested" && event.comment?.trim()) {
      return event.comment.trim();
    }
  }
  return null;
}

export function formatReviewActionLabel(action: TaskReviewEvent["action"]): string {
  switch (action) {
    case "submitted":
      return "Сдано на проверку";
    case "approved":
      return "Принято автором";
    case "revision_requested":
      return "Отправлено на доработку";
  }
}
