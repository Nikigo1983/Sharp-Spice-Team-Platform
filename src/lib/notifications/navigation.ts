import type { NotificationType } from "@/lib/notifications/types";

export type NotificationSection = "team-chat" | "tasks" | "formgrid";

const TOAST_NOTIFICATION_TYPES = new Set<NotificationType>([
  "team_chat",
  "task_new",
  "task_status",
  "client_new",
  "consultation_assigned",
]);

export function shouldShowNotificationToast(type: NotificationType): boolean {
  return TOAST_NOTIFICATION_TYPES.has(type);
}

export function getNotificationSection(
  type: NotificationType,
): NotificationSection | null {
  switch (type) {
    case "team_chat":
      return "team-chat";
    case "task_new":
    case "task_status":
      return "tasks";
    case "client_new":
    case "consultation_assigned":
      return "formgrid";
    default:
      return null;
  }
}

export function getNotificationHref(type: NotificationType): string | null {
  switch (type) {
    case "team_chat":
      return "/team-chat";
    case "task_new":
    case "task_status":
      return "/tasks";
    case "client_new":
    case "consultation_assigned":
      return "/new-formgrid-clients";
    default:
      return null;
  }
}

export function pathnameMatchesNotificationSection(
  pathname: string,
  section: NotificationSection,
): boolean {
  switch (section) {
    case "team-chat":
      return (
        pathname === "/team-chat" || pathname.startsWith("/team-chat/")
      );
    case "tasks":
      return pathname === "/tasks" || pathname.startsWith("/tasks/");
    case "formgrid":
      return (
        pathname === "/new-formgrid-clients" ||
        pathname.startsWith("/new-formgrid-clients/")
      );
    default:
      return false;
  }
}

export function isOnNotificationSection(
  pathname: string,
  type: NotificationType,
): boolean {
  const section = getNotificationSection(type);
  if (!section) return false;
  return pathnameMatchesNotificationSection(pathname, section);
}
