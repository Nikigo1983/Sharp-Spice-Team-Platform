import type { SessionUser } from "@/lib/auth/types";
import type { Task } from "./types";

export function isTaskAssignee(task: Task, userId: string): boolean {
  return task.assignees.some((assignee) => assignee.id === userId);
}

export function canChangeTaskStatus(task: Task, user: SessionUser): boolean {
  return (
    user.role === "owner" ||
    task.createdByUserId === user.id ||
    isTaskAssignee(task, user.id)
  );
}

export function canEditTask(task: Task, user: SessionUser): boolean {
  return user.role === "owner" || task.createdByUserId === user.id;
}

export function canDeleteTask(task: Task, user: SessionUser): boolean {
  return user.role === "owner" || task.createdByUserId === user.id;
}
