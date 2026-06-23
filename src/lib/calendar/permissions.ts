import type { SessionUser } from "@/lib/auth/types";
import { canViewVideoMeeting } from "./participants";
import type { CalendarEvent } from "./types";

export function canViewEvent(user: SessionUser, event: CalendarEvent): boolean {
  if (event.eventType === "video_meeting") {
    return canViewVideoMeeting(user, event);
  }

  if (event.scope === "company") {
    return true;
  }

  return event.ownerUserId === user.id;
}

export function canEditEvent(user: SessionUser, event: CalendarEvent): boolean {
  if (event.scope === "personal") {
    return event.ownerUserId === user.id;
  }

  return user.role === "owner" || event.createdByUserId === user.id;
}

export function canDeleteEvent(user: SessionUser, event: CalendarEvent): boolean {
  return canEditEvent(user, event);
}

export function canCreateWithScope(
  _user: SessionUser,
  scope: CalendarEvent["scope"],
): boolean {
  return scope === "personal" || scope === "company";
}
