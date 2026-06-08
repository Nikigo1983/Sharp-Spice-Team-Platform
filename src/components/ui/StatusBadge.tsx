import styles from "./StatusBadge.module.css";

export type StatusBadgeVariant =
  | "new"
  | "in_progress"
  | "consultation_scheduled"
  | "qualified"
  | "closed_won"
  | "closed_lost";

const STATUS_LABELS: Record<StatusBadgeVariant, string> = {
  new: "Новый",
  in_progress: "В работе",
  consultation_scheduled: "Консультация",
  qualified: "Квалифицирован",
  closed_won: "Успешно",
  closed_lost: "Закрыт",
};

export type StatusBadgeProps = {
  status: StatusBadgeVariant;
  label?: string;
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={[styles.badge, styles[status]].join(" ")}>
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}
