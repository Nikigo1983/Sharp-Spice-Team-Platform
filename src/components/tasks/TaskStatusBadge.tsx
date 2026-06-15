import styles from "./TaskStatusBadge.module.css";
import type { TaskStatus } from "@/lib/tasks/types";
import { TASK_STATUS_LABELS } from "@/lib/tasks/types";

const STATUS_ICONS: Partial<Record<TaskStatus, string>> = {
  completed: "✅",
  pending_approval: "👀",
  needs_revision: "🔄",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const icon = STATUS_ICONS[status];
  const label = icon
    ? `${icon} ${TASK_STATUS_LABELS[status]}`
    : TASK_STATUS_LABELS[status];

  return (
    <span className={[styles.badge, styles[status]].join(" ")}>
      {label}
    </span>
  );
}
