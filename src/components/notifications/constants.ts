import type { NotificationItem } from "./notification-context";

export const NOTIFICATION_TYPE_LABELS: Record<
  NotificationItem["type"],
  string
> = {
  team_chat: "Сообщение в чате",
  task_new: "Новая задача",
  task_status: "Статус задачи",
  task_completed: "Задача выполнена",
  task_pending_approval: "Задача на проверке",
  task_revision: "Доработка задачи",
  client_new: "Новый клиент",
  consultation_assigned: "Консультация",
  calendar_reminder: "Напоминание календаря",
  calendar_video_invite: "Видеовстреча",
  system: "Системное",
};

export const NOTIFICATION_TYPE_ICONS: Record<NotificationItem["type"], string> =
  {
    team_chat: "💬",
    task_new: "📋",
    task_status: "📋",
    task_completed: "✅",
    task_pending_approval: "👀",
    task_revision: "🔄",
    client_new: "👤",
    consultation_assigned: "📅",
    calendar_reminder: "📅",
    calendar_video_invite: "📹",
    system: "🔔",
  };

export function isSuccessNotification(type: NotificationItem["type"]): boolean {
  return type === "task_completed" || type === "task_pending_approval";
}

export function formatNotificationTime(iso: string): string {
  const datePart = iso.slice(0, 10);
  const timePart = iso.slice(11, 16);
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return iso;
  if (!timePart || timePart.length !== 5) return `${d}.${m}.${y}`;
  return `${d}.${m}.${y} • ${timePart}`;
}
