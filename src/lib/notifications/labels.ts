import type { NotificationType } from "./types";

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  team_chat: "Сообщение в чате",
  task_new: "Новая задача",
  task_status: "Статус задачи",
  task_completed: "Задача выполнена",
  client_new: "Новый клиент",
  consultation_assigned: "Консультация",
  system: "Системное",
};

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  team_chat: "💬",
  task_new: "📋",
  task_status: "📋",
  task_completed: "✅",
  client_new: "👤",
  consultation_assigned: "📅",
  system: "🔔",
};
