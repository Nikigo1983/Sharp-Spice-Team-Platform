import type { SessionUser } from "@/lib/auth/types";
import { isUserRole } from "@/lib/auth/users";
import { canViewEvent } from "./permissions";
import { isVideoMeeting } from "./meeting";
import type { CalendarEvent } from "./types";
import {
  getMeetingAccessPhase,
  getMeetingAccessWindow,
  isWithinMeetingWindow,
  MEETING_EARLY_MINUTES,
  MEETING_LATE_MINUTES,
  type MeetingAccessPhase,
} from "./meeting-window";

export {
  getMeetingAccessPhase,
  getMeetingAccessWindow,
  isWithinMeetingWindow,
  MEETING_EARLY_MINUTES,
  MEETING_LATE_MINUTES,
  type MeetingAccessPhase,
};

export class MeetingAccessError extends Error {
  readonly code:
    | "forbidden"
    | "invalid_role"
    | "not_video_meeting"
    | "outside_window";

  constructor(
    message: string,
    code:
      | "forbidden"
      | "invalid_role"
      | "not_video_meeting"
      | "outside_window",
  ) {
    super(message);
    this.name = "MeetingAccessError";
    this.code = code;
  }
}

export function assertCanJoinMeeting(
  user: SessionUser,
  event: CalendarEvent,
  now: Date = new Date(),
): void {
  if (!isUserRole(user.role)) {
    throw new MeetingAccessError("Forbidden", "invalid_role");
  }

  if (!canViewEvent(user, event)) {
    throw new MeetingAccessError("Forbidden", "forbidden");
  }

  if (!isVideoMeeting(event)) {
    throw new MeetingAccessError("Not a video meeting", "not_video_meeting");
  }

  if (!isWithinMeetingWindow(event, now)) {
    throw new MeetingAccessError("Meeting window closed", "outside_window");
  }
}

export function assertCanRecordMeetingAudit(
  user: SessionUser,
  event: CalendarEvent,
  action: "joined" | "left",
  now: Date = new Date(),
): void {
  if (!isUserRole(user.role)) {
    throw new MeetingAccessError("Forbidden", "invalid_role");
  }

  if (!canViewEvent(user, event)) {
    throw new MeetingAccessError("Forbidden", "forbidden");
  }

  if (!isVideoMeeting(event)) {
    throw new MeetingAccessError("Not a video meeting", "not_video_meeting");
  }

  if (action === "joined" && !isWithinMeetingWindow(event, now)) {
    throw new MeetingAccessError("Meeting window closed", "outside_window");
  }
}
