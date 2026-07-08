import "server-only";

import type { SessionUser } from "@/lib/auth/types";
import { isUserRole } from "@/lib/auth/users";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbInvites from "@/lib/supabase/calendar-meeting-guest-invites-repo";
import { MeetingAccessError } from "./meeting-access";
import {
  buildGuestJoinUrl,
  generateGuestInviteToken,
} from "./meeting-guest-invite";
import { isVideoMeeting } from "./meeting";
import { canViewEvent } from "./permissions";
import {
  handleGetCalendarEvent,
  type CalendarStoreDeps,
  defaultCalendarStoreDeps,
} from "./handlers";

export type GuestInviteHandlerError = {
  status: 403 | 404 | 503;
  error: string;
};

export type GuestInviteResponse = {
  guestJoinUrl: string;
  createdAt: string;
};

export type GuestInviteDeps = {
  getActiveInvite: typeof sbInvites.sbGetActiveGuestInviteByEventId;
  insertInvite: typeof sbInvites.sbInsertGuestInvite;
  revokeActiveInvites: typeof sbInvites.sbRevokeActiveGuestInvitesForEvent;
  isConfigured?: () => boolean;
};

export const defaultGuestInviteDeps: GuestInviteDeps = {
  getActiveInvite: sbInvites.sbGetActiveGuestInviteByEventId,
  insertInvite: sbInvites.sbInsertGuestInvite,
  revokeActiveInvites: sbInvites.sbRevokeActiveGuestInvitesForEvent,
  isConfigured: isSupabaseConfigured,
};

async function assertCanManageGuestInvite(
  session: SessionUser,
  eventId: string,
  deps: CalendarStoreDeps,
) {
  const eventResult = await handleGetCalendarEvent(session, eventId, deps);
  if ("status" in eventResult) {
    throw new MeetingAccessError("Event not found", "forbidden");
  }

  if (!isUserRole(session.role)) {
    throw new MeetingAccessError("Forbidden", "invalid_role");
  }

  if (!canViewEvent(session, eventResult.event)) {
    throw new MeetingAccessError("Forbidden", "forbidden");
  }

  if (!isVideoMeeting(eventResult.event)) {
    throw new MeetingAccessError("Not a video meeting", "not_video_meeting");
  }

  return eventResult.event;
}

export async function handleGetOrCreateGuestInvite(
  session: SessionUser,
  eventId: string,
  deps: CalendarStoreDeps = defaultCalendarStoreDeps,
  inviteDeps: GuestInviteDeps = defaultGuestInviteDeps,
): Promise<GuestInviteResponse | GuestInviteHandlerError> {
  try {
    await assertCanManageGuestInvite(session, eventId, deps);
  } catch (error) {
    if (error instanceof MeetingAccessError) {
      if (error.code === "not_video_meeting") {
        return { status: 404, error: error.message };
      }
      return { status: 403, error: error.message };
    }
    throw error;
  }

  if (!(inviteDeps.isConfigured ?? isSupabaseConfigured)()) {
    return { status: 503, error: "Guest invites not configured" };
  }

  const existing = await inviteDeps.getActiveInvite(eventId);
  if (existing) {
    return {
      guestJoinUrl: buildGuestJoinUrl(existing.token),
      createdAt: existing.createdAt,
    };
  }

  const created = await inviteDeps.insertInvite({
    eventId,
    token: generateGuestInviteToken(),
    createdByUserId: session.id,
  });

  return {
    guestJoinUrl: buildGuestJoinUrl(created.token),
    createdAt: created.createdAt,
  };
}

export async function handleRegenerateGuestInvite(
  session: SessionUser,
  eventId: string,
  deps: CalendarStoreDeps = defaultCalendarStoreDeps,
  inviteDeps: GuestInviteDeps = defaultGuestInviteDeps,
): Promise<GuestInviteResponse | GuestInviteHandlerError> {
  try {
    await assertCanManageGuestInvite(session, eventId, deps);
  } catch (error) {
    if (error instanceof MeetingAccessError) {
      if (error.code === "not_video_meeting") {
        return { status: 404, error: error.message };
      }
      return { status: 403, error: error.message };
    }
    throw error;
  }

  if (!(inviteDeps.isConfigured ?? isSupabaseConfigured)()) {
    return { status: 503, error: "Guest invites not configured" };
  }

  await inviteDeps.revokeActiveInvites(eventId);

  const created = await inviteDeps.insertInvite({
    eventId,
    token: generateGuestInviteToken(),
    createdByUserId: session.id,
  });

  return {
    guestJoinUrl: buildGuestJoinUrl(created.token),
    createdAt: created.createdAt,
  };
}
