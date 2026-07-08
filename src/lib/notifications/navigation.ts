import type { NotificationType } from "@/lib/notifications/types";
import { decodeCalendarReminderMessage } from "./calendar-reminder-copy";

export type NotificationSection = "team-chat" | "tasks" | "formgrid" | "calendar";

const TOAST_NOTIFICATION_TYPES = new Set<NotificationType>([
  "team_chat",
  "task_new",
  "task_status",
  "task_completed",
  "client_new",
  "consultation_assigned",
  "calendar_reminder",
  "calendar_video_invite",
]);

const CALENDAR_LINK_TYPES = new Set<NotificationType>([
  "calendar_reminder",
  "calendar_video_invite",
]);

function isCalendarLinkType(type: NotificationType): boolean {
  return CALENDAR_LINK_TYPES.has(type);
}

export function shouldShowNotificationToast(type: NotificationType): boolean {
  return TOAST_NOTIFICATION_TYPES.has(type);
}

export function getNotificationDisplayMessage(
  type: NotificationType,
  message: string,
): string {
  if (isCalendarLinkType(type)) {
    return decodeCalendarReminderMessage(message).display;
  }
  return message;
}

export function getNotificationSection(
  type: NotificationType,
): NotificationSection | null {
  switch (type) {
    case "team_chat":
      return "team-chat";
    case "task_new":
    case "task_status":
    case "task_completed":
      return "tasks";
    case "client_new":
    case "consultation_assigned":
      return "formgrid";
    case "calendar_reminder":
    case "calendar_video_invite":
      return "calendar";
    default:
      return null;
  }
}

export function getNotificationHref(
  type: NotificationType,
  message?: string,
): string | null {
  switch (type) {
    case "team_chat":
      return "/team-chat";
    case "task_new":
    case "task_status":
    case "task_completed":
      return "/tasks";
    case "client_new":
    case "consultation_assigned":
      return "/new-formgrid-clients";
    case "calendar_reminder":
    case "calendar_video_invite": {
      const { eventId, isVideoMeeting } = decodeCalendarReminderMessage(
        message ?? "",
      );
      if ((isVideoMeeting || type === "calendar_video_invite") && eventId) {
        return `/calendar/meet/${encodeURIComponent(eventId)}`;
      }
      return eventId
        ? `/calendar?event=${encodeURIComponent(eventId)}`
        : "/calendar";
    }
    default:
      return null;
  }
}

export function getNotificationActionLabel(
  type: NotificationType,
  message?: string,
): string | null {
  if (type === "calendar_video_invite") {
    return "Присоединиться";
  }

  if (type !== "calendar_reminder") {
    return null;
  }

  const { isVideoMeeting } = decodeCalendarReminderMessage(message ?? "");
  return isVideoMeeting ? "Присоединиться" : null;
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
    case "calendar":
      return pathname === "/calendar" || pathname.startsWith("/calendar/");
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
