import "server-only";

import { getSupabaseAdmin } from "./server";

type ParticipantRow = {
  event_id: string;
  user_id: string;
};

export async function sbListParticipantUserIdsByEventIds(
  eventIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (eventIds.length === 0) {
    return map;
  }

  const { data, error } = await getSupabaseAdmin()
    .from("calendar_event_participants")
    .select("event_id, user_id")
    .in("event_id", eventIds);

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as ParticipantRow[]) {
    const current = map.get(row.event_id) ?? [];
    current.push(row.user_id);
    map.set(row.event_id, current);
  }

  for (const [eventId, userIds] of map) {
    map.set(eventId, [...new Set(userIds)].sort());
  }

  return map;
}

export async function sbReplaceEventParticipants(
  eventId: string,
  userIds: string[],
): Promise<void> {
  const admin = getSupabaseAdmin();

  const { error: deleteError } = await admin
    .from("calendar_event_participants")
    .delete()
    .eq("event_id", eventId);

  if (deleteError) {
    throw deleteError;
  }

  if (userIds.length === 0) {
    return;
  }

  const rows = userIds.map((userId) => ({
    event_id: eventId,
    user_id: userId,
  }));

  const { error: insertError } = await admin
    .from("calendar_event_participants")
    .insert(rows);

  if (insertError) {
    throw insertError;
  }
}

export async function sbListEventIdsForParticipantUser(
  userId: string,
): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_event_participants")
    .select("event_id")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return [...new Set((data ?? []).map((row) => row.event_id as string))];
}
