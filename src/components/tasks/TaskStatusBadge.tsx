import styles from "./TaskStatusBadge.module.css";
import type { TaskStatus } from "@/lib/tasks/types";
import { TASK_STATUS_LABELS } from "@/lib/tasks/types";

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const label =
    status === "completed"
      ? `✅ ${TASK_STATUS_LABELS[status]}`
      : TASK_STATUS_LABELS[status];

  return (
    <span className={[styles.badge, styles[status]].join(" ")}>
      {label}
    </span>
  );
}
