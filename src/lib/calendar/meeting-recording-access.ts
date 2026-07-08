import "server-only";

import type { SessionUser } from "@/lib/auth/types";
import { assertCanJoinMeeting } from "./meeting-access";
import { canViewEvent } from "./permissions";
import type { CalendarEvent, CalendarMeetingRecording } from "./types";

export function assertCanManageMeetingRecording(
  user: SessionUser,
  event: CalendarEvent,
  now: Date = new Date(),
): void {
  assertCanJoinMeeting(user, event, now);
}

export function canViewMeetingRecording(
  user: SessionUser,
  event: CalendarEvent,
  recording: CalendarMeetingRecording,
): boolean {
  if (recording.status !== "complete" || !recording.storagePath) {
    return false;
  }

  return canViewEvent(user, event);
}
