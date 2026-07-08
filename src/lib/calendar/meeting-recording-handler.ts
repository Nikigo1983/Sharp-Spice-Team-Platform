import "server-only";

import { randomUUID } from "node:crypto";
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EgressStatus,
  S3Upload,
} from "livekit-server-sdk";
import type { SessionUser } from "@/lib/auth/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbRecordings from "@/lib/supabase/calendar-meeting-recordings-repo";
import {
  handleGetCalendarEvent,
  type CalendarStoreDeps,
  defaultCalendarStoreDeps,
} from "./handlers";
import { getMeetingRoomName } from "./meeting";
import { MeetingAccessError } from "./meeting-access";
import { assertCanManageMeetingRecording, canViewMeetingRecording } from "./meeting-recording-access";
import {
  buildMeetingRecordingStoragePath,
  createMeetingRecordingPlaybackUrl,
  getEgressStorageConfig,
  getLiveKitApiHost,
} from "./meeting-recording-storage";
import { getLiveKitEnv } from "./meeting-token";
import { canViewEvent } from "./permissions";
import type {
  CalendarMeetingRecording,
  CalendarMeetingRecordingWithEvent,
} from "./types";

export type MeetingRecordingHandlerError = {
  status: 400 | 403 | 404 | 409 | 422 | 503;
  error: string;
};

export type MeetingRecordingDeps = {
  insertRecording: typeof sbRecordings.sbInsertMeetingRecording;
  updateRecording: typeof sbRecordings.sbUpdateMeetingRecording;
  getRecordingById: typeof sbRecordings.sbGetMeetingRecordingById;
  getActiveByEvent: typeof sbRecordings.sbGetActiveMeetingRecordingByEvent;
  getByEgressId: typeof sbRecordings.sbGetMeetingRecordingByEgressId;
  listRecordings: typeof sbRecordings.sbListMeetingRecordings;
  isConfigured?: () => boolean;
};

export const defaultMeetingRecordingDeps: MeetingRecordingDeps = {
  insertRecording: sbRecordings.sbInsertMeetingRecording,
  updateRecording: sbRecordings.sbUpdateMeetingRecording,
  getRecordingById: sbRecordings.sbGetMeetingRecordingById,
  getActiveByEvent: sbRecordings.sbGetActiveMeetingRecordingByEvent,
  getByEgressId: sbRecordings.sbGetMeetingRecordingByEgressId,
  listRecordings: sbRecordings.sbListMeetingRecordings,
  isConfigured: isSupabaseConfigured,
};

function createEgressClient(env: NonNullable<ReturnType<typeof getLiveKitEnv>>) {
  return new EgressClient(
    getLiveKitApiHost(env.url),
    env.apiKey,
    env.apiSecret,
  );
}

function buildEncodedFileOutput(storagePath: string): EncodedFileOutput {
  const storage = getEgressStorageConfig();
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: storagePath,
    disableManifest: true,
  });

  if (storage) {
    output.output = {
      case: "s3",
      value: new S3Upload({
        accessKey: storage.accessKey,
        secret: storage.secret,
        bucket: storage.bucket,
        endpoint: storage.endpoint,
        region: storage.region,
        forcePathStyle: true,
      }),
    };
  }

  return output;
}

export async function handleStartMeetingRecording(
  session: SessionUser,
  eventId: string,
  storeDeps: CalendarStoreDeps = defaultCalendarStoreDeps,
  deps: MeetingRecordingDeps = defaultMeetingRecordingDeps,
): Promise<{ recording: CalendarMeetingRecording } | MeetingRecordingHandlerError> {
  const eventResult = await handleGetCalendarEvent(session, eventId, storeDeps);
  if ("status" in eventResult) {
    return { status: eventResult.status, error: eventResult.error };
  }

  try {
    assertCanManageMeetingRecording(session, eventResult.event);
  } catch (error) {
    if (error instanceof MeetingAccessError) {
      return { status: 403, error: error.message };
    }
    throw error;
  }

  if (!(deps.isConfigured ?? isSupabaseConfigured)()) {
    return { status: 503, error: "Meeting recordings not configured" };
  }

  const liveKitEnv = getLiveKitEnv();
  if (!liveKitEnv) {
    return { status: 503, error: "Meetings not configured" };
  }

  if (!getEgressStorageConfig()) {
    return {
      status: 503,
      error: "Recording storage not configured (LIVEKIT_EGRESS_S3_*)",
    };
  }

  const active = await deps.getActiveByEvent(eventId);
  if (active) {
    return { status: 409, error: "Recording already in progress" };
  }

  const recordingId = randomUUID();
  const storagePath = buildMeetingRecordingStoragePath(eventId, recordingId);
  const fileName = `${eventResult.event.title.trim() || "meeting"}-${recordingId.slice(0, 8)}.mp4`;

  const recording = await deps.insertRecording({
    id: recordingId,
    eventId,
    status: "starting",
    startedByUserId: session.id,
    startedByName: session.name,
    storagePath,
    fileName,
  });

  try {
    const egressClient = createEgressClient(liveKitEnv);
    const egressInfo = await egressClient.startRoomCompositeEgress(
      getMeetingRoomName(eventId),
      { file: buildEncodedFileOutput(storagePath) },
      { audioOnly: false },
    );

    const updated = await deps.updateRecording(recording.id, {
      egressId: egressInfo.egressId,
      status: "active",
    });

    return { recording: updated ?? recording };
  } catch (error) {
    await deps.updateRecording(recording.id, {
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Failed to start recording",
      endedAt: new Date().toISOString(),
    });
    return { status: 503, error: "Failed to start recording" };
  }
}

export async function handleStopMeetingRecording(
  session: SessionUser,
  eventId: string,
  storeDeps: CalendarStoreDeps = defaultCalendarStoreDeps,
  deps: MeetingRecordingDeps = defaultMeetingRecordingDeps,
): Promise<{ recording: CalendarMeetingRecording } | MeetingRecordingHandlerError> {
  const eventResult = await handleGetCalendarEvent(session, eventId, storeDeps);
  if ("status" in eventResult) {
    return { status: eventResult.status, error: eventResult.error };
  }

  try {
    assertCanManageMeetingRecording(session, eventResult.event);
  } catch (error) {
    if (error instanceof MeetingAccessError) {
      return { status: 403, error: error.message };
    }
    throw error;
  }

  const liveKitEnv = getLiveKitEnv();
  if (!liveKitEnv) {
    return { status: 503, error: "Meetings not configured" };
  }

  const active = await deps.getActiveByEvent(eventId);
  if (!active?.egressId) {
    return { status: 404, error: "No active recording" };
  }

  try {
    const egressClient = createEgressClient(liveKitEnv);
    await egressClient.stopEgress(active.egressId);
  } catch (error) {
    return {
      status: 503,
      error:
        error instanceof Error ? error.message : "Failed to stop recording",
    };
  }

  const updated = await deps.updateRecording(active.id, {
    status: "processing",
  });

  return { recording: updated ?? active };
}

export async function handleGetMeetingRecordingStatus(
  session: SessionUser,
  eventId: string,
  storeDeps: CalendarStoreDeps = defaultCalendarStoreDeps,
  deps: MeetingRecordingDeps = defaultMeetingRecordingDeps,
): Promise<
  | { recording: CalendarMeetingRecording | null }
  | MeetingRecordingHandlerError
> {
  const eventResult = await handleGetCalendarEvent(session, eventId, storeDeps);
  if ("status" in eventResult) {
    return { status: eventResult.status, error: eventResult.error };
  }

  try {
    assertCanManageMeetingRecording(session, eventResult.event);
  } catch (error) {
    if (error instanceof MeetingAccessError) {
      return { status: 403, error: error.message };
    }
    throw error;
  }

  const active = await deps.getActiveByEvent(eventId);
  return { recording: active };
}

export async function handleListMeetingRecordings(
  session: SessionUser,
  storeDeps: CalendarStoreDeps = defaultCalendarStoreDeps,
  deps: MeetingRecordingDeps = defaultMeetingRecordingDeps,
): Promise<
  { recordings: CalendarMeetingRecordingWithEvent[] } | MeetingRecordingHandlerError
> {
  if (!(deps.isConfigured ?? isSupabaseConfigured)()) {
    return { status: 503, error: "Meeting recordings not configured" };
  }

  const all = await deps.listRecordings();
  const visible: CalendarMeetingRecordingWithEvent[] = [];

  for (const item of all) {
    if (item.status !== "complete" || !item.storagePath) {
      continue;
    }

    const eventResult = await storeDeps.getEvent(item.eventId);
    if (!eventResult || !canViewEvent(session, eventResult)) {
      continue;
    }

    visible.push(item);
  }

  return { recordings: visible };
}

export async function handleGetMeetingRecordingPlayback(
  session: SessionUser,
  recordingId: string,
  storeDeps: CalendarStoreDeps = defaultCalendarStoreDeps,
  deps: MeetingRecordingDeps = defaultMeetingRecordingDeps,
): Promise<{ playbackUrl: string } | MeetingRecordingHandlerError> {
  const recording = await deps.getRecordingById(recordingId);
  if (!recording) {
    return { status: 404, error: "Recording not found" };
  }

  const event = await storeDeps.getEvent(recording.eventId);
  if (!event || !canViewMeetingRecording(session, event, recording)) {
    return { status: 403, error: "Forbidden" };
  }

  if (!recording.storagePath) {
    return { status: 404, error: "Recording file not available" };
  }

  const playbackUrl = await createMeetingRecordingPlaybackUrl(
    recording.storagePath,
  );
  if (!playbackUrl) {
    return { status: 404, error: "Recording file not available" };
  }

  return { playbackUrl };
}

export async function handleLiveKitEgressWebhook(
  egressId: string,
  status: EgressStatus,
  errorMessage: string | undefined,
  fileResults: Array<{
    filename?: string;
    size?: bigint | number;
    duration?: bigint | number;
  }>,
  deps: MeetingRecordingDeps = defaultMeetingRecordingDeps,
): Promise<void> {
  const recording = await deps.getByEgressId(egressId);
  if (!recording) {
    return;
  }

  if (status === EgressStatus.EGRESS_COMPLETE) {
    const file = fileResults[0];
    const storagePath =
      file?.filename?.trim() || recording.storagePath || null;

    await deps.updateRecording(recording.id, {
      status: "complete",
      storagePath,
      fileName: recording.fileName,
      durationSeconds: file?.duration
        ? Number(file.duration)
        : recording.durationSeconds,
      fileSizeBytes: file?.size ? Number(file.size) : recording.fileSizeBytes,
      endedAt: new Date().toISOString(),
      errorMessage: null,
    });
    return;
  }

  if (
    status === EgressStatus.EGRESS_FAILED ||
    status === EgressStatus.EGRESS_ABORTED ||
    status === EgressStatus.EGRESS_LIMIT_REACHED
  ) {
    await deps.updateRecording(recording.id, {
      status: "failed",
      errorMessage: errorMessage ?? "Recording failed",
      endedAt: new Date().toISOString(),
    });
    return;
  }

  if (status === EgressStatus.EGRESS_ENDING) {
    await deps.updateRecording(recording.id, {
      status: "processing",
    });
  }
}
