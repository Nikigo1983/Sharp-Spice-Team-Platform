export const NOTIFICATION_TYPES = [
  "team_chat",
  "task_new",
  "task_status",
  "task_completed",
  "task_pending_approval",
  "task_revision",
  "client_new",
  "consultation_assigned",
  "calendar_reminder",
  "calendar_video_invite",
  "system",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type Notification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  author_name: string | null;
  is_read: boolean;
  created_at: string;
};

export type CreateNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  author_name?: string | null;
};
