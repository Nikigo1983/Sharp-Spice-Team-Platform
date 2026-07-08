import "server-only";

import { randomUUID } from "node:crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbAudit from "@/lib/supabase/calendar-meeting-audit-repo";
import * as sbInvites from "@/lib/supabase/calendar-meeting-guest-invites-repo";
import { getEvent } from "./store";
import { isVideoMeeting, getMeetingRoomName } from "./meeting";
import {
  getMeetingAccessPhase,
  isWithinMeetingWindow,
  type MeetingAccessPhase,
} from "./meeting-access";
import {
  isGuestParticipantId,
  normalizeGuestDisplayName,
} from "./meeting-guest-invite";
import {
  getLiveKitEnv,
  mintGuestMeetingAccessToken,
} from "./meeting-token";
import type { CalendarEvent } from "./types";
import type { CalendarMeetingAuditAction } from "./types";

export type GuestMeetingPreview =
  | {
      event: CalendarEvent;
      phase: MeetingAccessPhase;
    }
  | { error: "invalid_invite" | "not_video" | "not_found" | "not_configured" };

export type GuestMeetingPreviewDeps = {
  getInviteByToken: typeof sbInvites.sbGetGuestInviteByToken;
  getEventById: typeof getEvent;
  isConfigured?: () => boolean;
};

export const defaultGuestMeetingPreviewDeps: GuestMeetingPreviewDeps = {
  getInviteByToken: sbInvites.sbGetGuestInviteByToken,
  getEventById: getEvent,
  isConfigured: isSupabaseConfigured,
};

export async function resolveGuestMeetingPreview(
  inviteToken: string,
  deps: GuestMeetingPreviewDeps = defaultGuestMeetingPreviewDeps,
  now: Date = new Date(),
): Promise<GuestMeetingPreview> {
  const token = inviteToken.trim();
  if (!token) {
    return { error: "invalid_invite" };
  }

  if (!(deps.isConfigured ?? isSupabaseConfigured)()) {
    return { error: "not_configured" };
  }

  const invite = await deps.getInviteByToken(token);
  if (!invite) {
    return { error: "invalid_invite" };
  }

  const event = await deps.getEventById(invite.eventId);
  if (!event) {
    return { error: "not_found" };
  }

  if (!isVideoMeeting(event)) {
    return { error: "not_video" };
  }

  return {
    event,
    phase: getMeetingAccessPhase(event, now),
  };
}

export type GuestTokenHandlerError = {
  status: 400 | 403 | 404 | 503;
  error: string;
};

export type GuestTokenResponse = {
  wsUrl: string;
  token: string;
  roomName: string;
  expiresAt: string;
  guestId: string;
  eventTitle: string;
};

export async function handleMintGuestMeetingToken(
  inviteToken: string,
  displayNameInput: unknown,
  deps: GuestMeetingPreviewDeps = defaultGuestMeetingPreviewDeps,
  now: Date = new Date(),
): Promise<GuestTokenResponse | GuestTokenHandlerError> {
  const displayName = normalizeGuestDisplayName(displayNameInput);
  if (!displayName) {
    return { status: 400, error: "Invalid display name" };
  }

  const preview = await resolveGuestMeetingPreview(inviteToken, deps, now);
  if ("error" in preview) {
    switch (preview.error) {
      case "invalid_invite":
        return { status: 404, error: "Invite link invalid" };
      case "not_found":
        return { status: 404, error: "Meeting not found" };
      case "not_video":
        return { status: 404, error: "Not a video meeting" };
      case "not_configured":
        return { status: 503, error: "Guest invites not configured" };
    }
  }

  if (!isWithinMeetingWindow(preview.event, now)) {
    return { status: 403, error: "Meeting window closed" };
  }

  const env = getLiveKitEnv();
  if (!env) {
    return { status: 503, error: "Meetings not configured" };
  }

  const guestId = `guest-${randomUUID()}`;
  const minted = await mintGuestMeetingAccessToken(
    guestId,
    displayName,
    preview.event,
    env,
    now,
  );

  return {
    wsUrl: env.url,
    ...minted,
    guestId,
    eventTitle: preview.event.title,
  };
}

export type GuestAuditHandlerError = {
  status: 400 | 403 | 404 | 503;
  error: string;
};

export async function handleRecordGuestMeetingAudit(
  inviteToken: string,
  guestId: string,
  displayNameInput: unknown,
  action: CalendarMeetingAuditAction,
  deps: GuestMeetingPreviewDeps = defaultGuestMeetingPreviewDeps,
  now: Date = new Date(),
): Promise<{ ok: true } | GuestAuditHandlerError> {
  const displayName = normalizeGuestDisplayName(displayNameInput);
  if (!displayName || !isGuestParticipantId(guestId)) {
    return { status: 400, error: "Invalid guest identity" };
  }

  if (!(deps.isConfigured ?? isSupabaseConfigured)()) {
    return { status: 503, error: "Guest audit not configured" };
  }

  const preview = await resolveGuestMeetingPreview(inviteToken, deps, now);
  if ("error" in preview) {
    return { status: 404, error: "Invite link invalid" };
  }

  if (action === "joined" && !isWithinMeetingWindow(preview.event, now)) {
    return { status: 403, error: "Meeting window closed" };
  }

  await sbAudit.sbInsertCalendarMeetingAudit({
    eventId: preview.event.id,
    userId: guestId,
    userName: displayName,
    roomName: getMeetingRoomName(preview.event.id),
    action,
    participantType: "guest",
  });

  return { ok: true };
}
