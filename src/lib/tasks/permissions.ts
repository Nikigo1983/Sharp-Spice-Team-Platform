import type { SessionUser } from "@/lib/auth/types";
import type { Task, TaskAttachment, TaskStatus } from "./types";
import { taskNeedsApprovalWorkflow } from "./workflow";

export function isTaskAssignee(task: Task, userId: string): boolean {
  return task.assignees.some((assignee) => assignee.id === userId);
}

/** Задачу видят только автор и назначенные исполнители. */
export function canViewTask(task: Task, user: SessionUser): boolean {
  if (isTaskCreator(task, user)) return true;
  return isTaskAssignee(task, user.id);
}

/** Кто создал и назначил задачу (автор). */
export function isTaskCreator(task: Task, user: SessionUser): boolean {
  const creatorId = task.createdByUserId?.trim();
  if (creatorId) {
    if (creatorId === user.id) return true;
    if (creatorId.toLowerCase() === user.email.toLowerCase()) return true;
  }

  return task.createdByName.trim() === user.name.trim();
}

export function canChangeTaskStatus(task: Task, user: SessionUser): boolean {
  return (
    user.role === "owner" ||
    isTaskCreator(task, user) ||
    isTaskAssignee(task, user.id)
  );
}

/** Исполнитель может сдать задачу на проверку. */
export function canSubmitForApproval(task: Task, user: SessionUser): boolean {
  if (!taskNeedsApprovalWorkflow(task)) return false;
  if (!isTaskAssignee(task, user.id)) return false;
  if (task.status === "pending_approval" || task.status === "completed") {
    return false;
  }
  return (
    task.status === "new" ||
    task.status === "in_progress" ||
    task.status === "needs_revision"
  );
}

/** Автор (или владелец) принимает или отправляет на доработку. */
export function canReviewTask(task: Task, user: SessionUser): boolean {
  if (task.status !== "pending_approval") return false;
  return user.role === "owner" || isTaskCreator(task, user);
}

/** Прямое завершение без согласования (нет стороннего исполнителя). */
export function canDirectComplete(task: Task, user: SessionUser): boolean {
  if (taskNeedsApprovalWorkflow(task)) return false;
  if (task.status === "completed" || task.status === "pending_approval") {
    return false;
  }
  return canChangeTaskStatus(task, user);
}

export function canStartTask(task: Task, user: SessionUser): boolean {
  if (task.status !== "new") return false;
  return canChangeTaskStatus(task, user);
}

export function canEditTask(task: Task, user: SessionUser): boolean {
  return user.role === "owner" || isTaskCreator(task, user);
}

export function canDeleteTask(task: Task, user: SessionUser): boolean {
  return user.role === "owner" || isTaskCreator(task, user);
}

/** Статусы, доступные при ручном редактировании задачи автором. */
export const TASK_MANUAL_EDIT_STATUSES: TaskStatus[] = ["new", "in_progress"];

/** Автор, исполнитель или владелец может прикреплять файлы. */
export function canManageTaskAttachments(task: Task, user: SessionUser): boolean {
  return (
    user.role === "owner" ||
    isTaskCreator(task, user) ||
    isTaskAssignee(task, user.id)
  );
}

/** Удалить вложение может автор задачи, владелец или тот, кто его загрузил. */
export function canDeleteTaskAttachment(
  task: Task,
  attachment: TaskAttachment,
  user: SessionUser,
): boolean {
  return (
    user.role === "owner" ||
    isTaskCreator(task, user) ||
    attachment.uploadedByUserId === user.id
  );
}
