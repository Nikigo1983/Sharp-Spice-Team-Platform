import type { SessionUser } from "@/lib/auth/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbAudit from "@/lib/supabase/calendar-meeting-audit-repo";
import {
  assertCanRecordMeetingAudit,
  MeetingAccessError,
} from "./meeting-access";
import { getMeetingRoomName } from "./meeting";
import {
  handleGetCalendarEvent,
  type CalendarStoreDeps,
  defaultCalendarStoreDeps,
} from "./handlers";
import type {
  CalendarMeetingAudit,
  CalendarMeetingAuditAction,
} from "./types";
import { CALENDAR_MEETING_AUDIT_ACTIONS } from "./types";

export type MeetingAuditHandlerError = {
  status: 400 | 403 | 404 | 503;
  error: string;
};

export type MeetingAuditDeps = {
  insertAudit: typeof sbAudit.sbInsertCalendarMeetingAudit;
  isConfigured?: () => boolean;
};

export const defaultMeetingAuditDeps: MeetingAuditDeps = {
  insertAudit: sbAudit.sbInsertCalendarMeetingAudit,
  isConfigured: isSupabaseConfigured,
};

export function parseMeetingAuditAction(
  body: unknown,
): CalendarMeetingAuditAction {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const action = (body as Record<string, unknown>).action;
  if (
    typeof action !== "string" ||
    !CALENDAR_MEETING_AUDIT_ACTIONS.includes(
      action as CalendarMeetingAuditAction,
    )
  ) {
    throw new Error("Invalid action");
  }

  return action as CalendarMeetingAuditAction;
}

export async function handleRecordMeetingAudit(
  session: SessionUser,
  eventId: string,
  action: CalendarMeetingAuditAction,
  deps: CalendarStoreDeps = defaultCalendarStoreDeps,
  auditDeps: MeetingAuditDeps = defaultMeetingAuditDeps,
  now: Date = new Date(),
): Promise<{ audit: CalendarMeetingAudit } | MeetingAuditHandlerError> {
  const eventResult = await handleGetCalendarEvent(session, eventId, deps);
  if ("status" in eventResult) {
    return { status: 404, error: eventResult.error };
  }

  try {
    assertCanRecordMeetingAudit(session, eventResult.event, action, now);
  } catch (error) {
    if (error instanceof MeetingAccessError) {
      return { status: 403, error: error.message };
    }
    throw error;
  }

  if (!(auditDeps.isConfigured ?? isSupabaseConfigured)()) {
    return { status: 503, error: "Meeting audit not configured" };
  }

  const audit = await auditDeps.insertAudit({
    eventId: eventResult.event.id,
    userId: session.id,
    userName: session.name,
    roomName: getMeetingRoomName(eventResult.event.id),
    action,
  });

  return { audit };
}
