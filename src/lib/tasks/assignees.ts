import type { TaskAssignee } from "./types";

export function normalizeAssignees(value: unknown): TaskAssignee[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is TaskAssignee =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as TaskAssignee).id === "string" &&
        typeof (item as TaskAssignee).name === "string",
    )
    .map((item) => ({ id: item.id, name: item.name }));
}

export function formatAssigneeNames(assignees: TaskAssignee[]): string {
  if (!assignees.length) return "Не назначено";
  return assignees.map((assignee) => assignee.name).join(", ");
}
