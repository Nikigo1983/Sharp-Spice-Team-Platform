import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "./server";

import type { CalendarMeetingGuestInvite } from "@/lib/calendar/types";

export type { CalendarMeetingGuestInvite };

type CalendarMeetingGuestInviteRow = {
  id: string;
  event_id: string;
  token: string;
  created_by_user_id: string;
  enabled: boolean;
  created_at: string;
  revoked_at: string | null;
};

function mapRow(row: CalendarMeetingGuestInviteRow): CalendarMeetingGuestInvite {
  return {
    id: row.id,
    eventId: row.event_id,
    token: row.token,
    createdByUserId: row.created_by_user_id,
    enabled: row.enabled,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

export async function sbGetActiveGuestInviteByEventId(
  eventId: string,
): Promise<CalendarMeetingGuestInvite | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_guest_invites")
    .select("*")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as CalendarMeetingGuestInviteRow) : null;
}

export async function sbGetGuestInviteByToken(
  token: string,
): Promise<CalendarMeetingGuestInvite | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_guest_invites")
    .select("*")
    .eq("token", token)
    .eq("enabled", true)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as CalendarMeetingGuestInviteRow) : null;
}

export async function sbInsertGuestInvite(input: {
  eventId: string;
  token: string;
  createdByUserId: string;
}): Promise<CalendarMeetingGuestInvite> {
  const row = {
    id: randomUUID(),
    event_id: input.eventId,
    token: input.token,
    created_by_user_id: input.createdByUserId,
    enabled: true,
  };

  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_guest_invites")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data as CalendarMeetingGuestInviteRow);
}

export async function sbRevokeActiveGuestInvitesForEvent(
  eventId: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("calendar_meeting_guest_invites")
    .update({
      enabled: false,
      revoked_at: new Date().toISOString(),
    })
    .eq("event_id", eventId)
    .eq("enabled", true)
    .is("revoked_at", null);

  if (error) throw error;
}
