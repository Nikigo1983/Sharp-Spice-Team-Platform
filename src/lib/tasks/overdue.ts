import type { Task } from "./types";

export function isTaskOverdue(task: Task): boolean {
  if (
    task.status === "completed" ||
    task.status === "pending_approval" ||
    !task.dueDate
  ) {
    return false;
  }
  return task.dueDate < new Date().toISOString().slice(0, 10);
}
