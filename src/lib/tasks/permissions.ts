import type { SessionUser } from "@/lib/auth/types";
import type { Task } from "./types";

export function isTaskAssignee(task: Task, userId: string): boolean {
  return task.assignees.some((assignee) => assignee.id === userId);
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

export function canEditTask(task: Task, user: SessionUser): boolean {
  return user.role === "owner" || isTaskCreator(task, user);
}

export function canDeleteTask(task: Task, user: SessionUser): boolean {
  return user.role === "owner" || isTaskCreator(task, user);
}
