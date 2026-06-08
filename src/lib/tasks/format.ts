import type { TaskStatus } from "@/lib/tasks/types";
import { TASK_STATUS_LABELS } from "@/lib/tasks/types";

export function formatTaskDate(iso: string | null): string {
  if (!iso) return "—";
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function formatTaskDateTime(iso: string): string {
  return formatTaskDate(iso);
}

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "new", label: TASK_STATUS_LABELS.new },
  { value: "in_progress", label: TASK_STATUS_LABELS.in_progress },
  { value: "completed", label: TASK_STATUS_LABELS.completed },
];
