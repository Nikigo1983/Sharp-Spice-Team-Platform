import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "./server";
import type {
  CalendarMeetingGuestAdmission,
  GuestAdmissionStatus,
} from "@/lib/calendar/types";

type CalendarMeetingGuestAdmissionRow = {
  id: string;
  event_id: string;
  invite_id: string;
  guest_id: string;
  display_name: string;
  status: GuestAdmissionStatus;
  created_at: string;
  decided_at: string | null;
  decided_by_user_id: string | null;
};

function mapRow(
  row: CalendarMeetingGuestAdmissionRow,
): CalendarMeetingGuestAdmission {
  return {
    id: row.id,
    eventId: row.event_id,
    inviteId: row.invite_id,
    guestId: row.guest_id,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedByUserId: row.decided_by_user_id,
  };
}

export async function sbInsertGuestAdmission(input: {
  eventId: string;
  inviteId: string;
  guestId: string;
  displayName: string;
}): Promise<CalendarMeetingGuestAdmission> {
  const row = {
    id: randomUUID(),
    event_id: input.eventId,
    invite_id: input.inviteId,
    guest_id: input.guestId,
    display_name: input.displayName,
    status: "pending" as const,
  };

  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_guest_admissions")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data as CalendarMeetingGuestAdmissionRow);
}

export async function sbGetGuestAdmissionById(
  id: string,
): Promise<CalendarMeetingGuestAdmission | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_guest_admissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as CalendarMeetingGuestAdmissionRow) : null;
}

export async function sbListGuestAdmissionsByEvent(
  eventId: string,
  status?: GuestAdmissionStatus,
): Promise<CalendarMeetingGuestAdmission[]> {
  let query = getSupabaseAdmin()
    .from("calendar_meeting_guest_admissions")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as CalendarMeetingGuestAdmissionRow[]).map(mapRow);
}

export async function sbUpdateGuestAdmissionStatus(input: {
  id: string;
  status: GuestAdmissionStatus;
  decidedByUserId?: string | null;
}): Promise<CalendarMeetingGuestAdmission | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_guest_admissions")
    .update({
      status: input.status,
      decided_at: new Date().toISOString(),
      decided_by_user_id: input.decidedByUserId ?? null,
    })
    .eq("id", input.id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as CalendarMeetingGuestAdmissionRow) : null;
}
