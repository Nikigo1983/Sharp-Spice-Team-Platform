import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "./server";
import type {
  CalendarMeetingRecording,
  CalendarMeetingRecordingWithEvent,
  MeetingRecordingStatus,
} from "@/lib/calendar/types";

type CalendarMeetingRecordingRow = {
  id: string;
  event_id: string;
  egress_id: string | null;
  status: MeetingRecordingStatus;
  started_by_user_id: string;
  started_by_name: string;
  storage_path: string | null;
  file_name: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  error_message: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
};

function mapRow(row: CalendarMeetingRecordingRow): CalendarMeetingRecording {
  return {
    id: row.id,
    eventId: row.event_id,
    egressId: row.egress_id,
    status: row.status,
    startedByUserId: row.started_by_user_id,
    startedByName: row.started_by_name,
    storagePath: row.storage_path,
    fileName: row.file_name,
    durationSeconds: row.duration_seconds,
    fileSizeBytes: row.file_size_bytes,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

export async function sbInsertMeetingRecording(input: {
  id?: string;
  eventId: string;
  egressId?: string | null;
  status?: MeetingRecordingStatus;
  startedByUserId: string;
  startedByName: string;
  storagePath?: string | null;
  fileName?: string | null;
}): Promise<CalendarMeetingRecording> {
  const row = {
    id: input.id ?? randomUUID(),
    event_id: input.eventId,
    egress_id: input.egressId ?? null,
    status: input.status ?? ("starting" as const),
    started_by_user_id: input.startedByUserId,
    started_by_name: input.startedByName,
    storage_path: input.storagePath ?? null,
    file_name: input.fileName ?? null,
  };

  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_recordings")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data as CalendarMeetingRecordingRow);
}

export async function sbUpdateMeetingRecording(
  id: string,
  patch: Partial<{
    egressId: string | null;
    status: MeetingRecordingStatus;
    storagePath: string | null;
    fileName: string | null;
    durationSeconds: number | null;
    fileSizeBytes: number | null;
    errorMessage: string | null;
    endedAt: string | null;
  }>,
): Promise<CalendarMeetingRecording | null> {
  const row: Record<string, unknown> = {};
  if (patch.egressId !== undefined) row.egress_id = patch.egressId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.storagePath !== undefined) row.storage_path = patch.storagePath;
  if (patch.fileName !== undefined) row.file_name = patch.fileName;
  if (patch.durationSeconds !== undefined) {
    row.duration_seconds = patch.durationSeconds;
  }
  if (patch.fileSizeBytes !== undefined) row.file_size_bytes = patch.fileSizeBytes;
  if (patch.errorMessage !== undefined) row.error_message = patch.errorMessage;
  if (patch.endedAt !== undefined) row.ended_at = patch.endedAt;

  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_recordings")
    .update(row)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as CalendarMeetingRecordingRow) : null;
}

export async function sbGetMeetingRecordingById(
  id: string,
): Promise<CalendarMeetingRecording | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_recordings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as CalendarMeetingRecordingRow) : null;
}

export async function sbGetMeetingRecordingByEgressId(
  egressId: string,
): Promise<CalendarMeetingRecording | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_recordings")
    .select("*")
    .eq("egress_id", egressId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as CalendarMeetingRecordingRow) : null;
}

export async function sbGetActiveMeetingRecordingByEvent(
  eventId: string,
): Promise<CalendarMeetingRecording | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_recordings")
    .select("*")
    .eq("event_id", eventId)
    .in("status", ["starting", "active", "processing"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as CalendarMeetingRecordingRow) : null;
}

export async function sbListMeetingRecordings(): Promise<
  CalendarMeetingRecordingWithEvent[]
> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_meeting_recordings")
    .select(
      "*, calendar_events!inner(title, start_at, linked_client_id, linked_client_name)",
    )
    .order("started_at", { ascending: false });

  if (error) throw error;

  return (data as Array<
    CalendarMeetingRecordingRow & {
      calendar_events: {
        title: string;
        start_at: string;
        linked_client_id: string | null;
        linked_client_name: string | null;
      };
    }
  >).map((row) => ({
    ...mapRow(row),
    eventTitle: row.calendar_events.title,
    eventStartAt: row.calendar_events.start_at,
    linkedClientId: row.calendar_events.linked_client_id,
    linkedClientName: row.calendar_events.linked_client_name,
  }));
}
