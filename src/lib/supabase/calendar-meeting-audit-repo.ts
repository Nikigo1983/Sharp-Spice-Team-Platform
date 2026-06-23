import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "./server";
import type {
  CalendarMeetingAudit,
  InsertCalendarMeetingAuditInput,
} from "@/lib/calendar/types";

type CalendarMeetingAuditRow = {
  id: string;
  event_id: string;
  user_id: string;
  user_name: string;
  room_name: string;
  action: CalendarMeetingAudit["action"];
  occurred_at: string;
};

function mapRow(row: CalendarMeetingAuditRow): CalendarMeetingAudit {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    userName: row.user_name,
    roomName: row.room_name,
    action: row.action,
    occurredAt: row.occurred_at,
  };
}

export async function sbInsertCalendarMeetingAudit(
  input: InsertCalendarMeetingAuditInput,
): Promise<CalendarMeetingAudit> {
  const row = {
    id: randomUUID(),
    event_id: input.eventId,
    user_id: input.userId,
    user_name: input.userName,
    room_name: input.roomName,
    action: input.action,
  };

  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_audit")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data as CalendarMeetingAuditRow);
}
