import "server-only";

import { AccessToken } from "livekit-server-sdk";
import type { SessionUser } from "@/lib/auth/types";
import { getMeetingRoomName } from "./meeting";
import { getMeetingAccessWindow } from "./meeting-access";
import type { CalendarEvent } from "./types";

export type LiveKitEnv = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

export function getLiveKitEnv(): LiveKitEnv | null {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

  if (!url || !apiKey || !apiSecret) {
    return null;
  }

  return { url, apiKey, apiSecret };
}

export function buildMeetingTokenTtlSeconds(
  event: Pick<CalendarEvent, "startAt" | "endAt">,
  now: Date = new Date(),
): number {
  const { closesAt } = getMeetingAccessWindow(event);
  const remainingMs = closesAt.getTime() - now.getTime();
  const ttlSeconds = Math.ceil(remainingMs / 1000);
  return Math.min(3600, Math.max(1, ttlSeconds));
}

export async function mintMeetingAccessToken(
  user: SessionUser,
  event: CalendarEvent,
  env: LiveKitEnv,
  now: Date = new Date(),
): Promise<{ token: string; roomName: string; expiresAt: string }> {
  const roomName = getMeetingRoomName(event.id);
  const ttlSeconds = buildMeetingTokenTtlSeconds(event, now);
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  const accessToken = new AccessToken(env.apiKey, env.apiSecret, {
    identity: user.id,
    name: user.name,
    ttl: ttlSeconds,
  });

  accessToken.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });

  return {
    token: await accessToken.toJwt(),
    roomName,
    expiresAt,
  };
}
