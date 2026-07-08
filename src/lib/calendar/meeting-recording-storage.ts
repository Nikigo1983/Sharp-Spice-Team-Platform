import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const MEETING_RECORDINGS_BUCKET = "meeting-recordings";
const LOCAL_DIR = path.join(process.cwd(), ".data", "meeting-recordings");
const PLAYBACK_TTL_SECONDS = 60 * 60;

export type EgressStorageConfig = {
  accessKey: string;
  secret: string;
  bucket: string;
  endpoint: string;
  region: string;
};

export function getEgressStorageConfig(): EgressStorageConfig | null {
  const accessKey = process.env.LIVEKIT_EGRESS_S3_ACCESS_KEY?.trim();
  const secret = process.env.LIVEKIT_EGRESS_S3_SECRET?.trim();
  const endpoint = process.env.LIVEKIT_EGRESS_S3_ENDPOINT?.trim();
  const bucket =
    process.env.LIVEKIT_EGRESS_S3_BUCKET?.trim() ?? MEETING_RECORDINGS_BUCKET;
  const region = process.env.LIVEKIT_EGRESS_S3_REGION?.trim() ?? "us-east-1";

  if (!accessKey || !secret || !endpoint) {
    return null;
  }

  return { accessKey, secret, bucket, endpoint, region };
}

export function buildMeetingRecordingStoragePath(
  eventId: string,
  recordingId: string,
): string {
  return `${eventId}/${recordingId}.mp4`;
}

export async function createMeetingRecordingPlaybackUrl(
  storagePath: string,
): Promise<string | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(MEETING_RECORDINGS_BUCKET)
      .createSignedUrl(storagePath, PLAYBACK_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      return null;
    }

    return data.signedUrl;
  }

  const localPath = path.join(LOCAL_DIR, storagePath.replace(/\//g, "_"));
  try {
    await readFile(localPath);
    return `/api/meeting-recordings/local/${encodeURIComponent(storagePath)}`;
  } catch {
    return null;
  }
}

export async function saveMeetingRecordingLocalCopy(
  storagePath: string,
  data: Buffer,
): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin()
      .storage.from(MEETING_RECORDINGS_BUCKET)
      .upload(storagePath, data, {
        contentType: "video/mp4",
        upsert: true,
      });
    if (error) throw error;
    return;
  }

  const localPath = path.join(LOCAL_DIR, storagePath.replace(/\//g, "_"));
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, data);
}

export async function readMeetingRecordingLocalCopy(
  storagePath: string,
): Promise<Buffer | null> {
  const localPath = path.join(LOCAL_DIR, storagePath.replace(/\//g, "_"));
  try {
    return await readFile(localPath);
  } catch {
    return null;
  }
}

export function getLiveKitApiHost(wsUrl: string): string {
  return wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}
