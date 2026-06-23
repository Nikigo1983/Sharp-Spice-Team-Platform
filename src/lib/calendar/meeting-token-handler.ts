import type { SessionUser } from "@/lib/auth/types";
import {
  assertCanJoinMeeting,
  MeetingAccessError,
} from "./meeting-access";
import { getLiveKitEnv, mintMeetingAccessToken } from "./meeting-token";
import {
  handleGetCalendarEvent,
  type CalendarStoreDeps,
  defaultCalendarStoreDeps,
} from "./handlers";

export type MeetingTokenHandlerError = {
  status: 403 | 404 | 503;
  error: string;
};

export type MeetingTokenResponse = {
  wsUrl: string;
  token: string;
  roomName: string;
  expiresAt: string;
};

export async function handleMintMeetingToken(
  session: SessionUser,
  eventId: string,
  deps: CalendarStoreDeps = defaultCalendarStoreDeps,
  now: Date = new Date(),
): Promise<MeetingTokenResponse | MeetingTokenHandlerError> {
  const eventResult = await handleGetCalendarEvent(session, eventId, deps);
  if ("status" in eventResult) {
    return { status: 404, error: eventResult.error };
  }

  try {
    assertCanJoinMeeting(session, eventResult.event, now);
  } catch (error) {
    if (error instanceof MeetingAccessError) {
      return { status: 403, error: error.message };
    }
    throw error;
  }

  const env = getLiveKitEnv();
  if (!env) {
    return { status: 503, error: "Meetings not configured" };
  }

  const minted = await mintMeetingAccessToken(
    session,
    eventResult.event,
    env,
    now,
  );

  return {
    wsUrl: env.url,
    ...minted,
  };
}
