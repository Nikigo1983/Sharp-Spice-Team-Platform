import "server-only";

import { randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/auth/types";
import { isUserRole } from "@/lib/auth/users";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbAdmissions from "@/lib/supabase/calendar-meeting-guest-admissions-repo";
import * as sbInvites from "@/lib/supabase/calendar-meeting-guest-invites-repo";
import {
  handleGetCalendarEvent,
  type CalendarStoreDeps,
  defaultCalendarStoreDeps,
} from "./handlers";
import { isWithinMeetingWindow, MeetingAccessError } from "./meeting-access";
import {
  isGuestParticipantId,
  normalizeGuestDisplayName,
} from "./meeting-guest-invite";
import { canViewEvent } from "./permissions";
import { isVideoMeeting } from "./meeting";
import type { CalendarMeetingGuestAdmission } from "./types";
import {
  resolveGuestMeetingPreview,
  type GuestMeetingPreviewDeps,
  defaultGuestMeetingPreviewDeps,
} from "./meeting-guest-handler";

export type GuestAdmissionHandlerError = {
  status: 400 | 403 | 404 | 503;
  error: string;
};

export type GuestAdmissionRequestResponse = {
  admissionId: string;
  guestId: string;
  status: "pending";
  waitingRoom: boolean;
};

export type GuestAdmissionStatusResponse = {
  admissionId: string;
  guestId: string;
  displayName: string;
  status: CalendarMeetingGuestAdmission["status"];
};

export type GuestAdmissionDeps = GuestMeetingPreviewDeps & {
  insertAdmission: typeof sbAdmissions.sbInsertGuestAdmission;
  getAdmissionById: typeof sbAdmissions.sbGetGuestAdmissionById;
  listAdmissionsByEvent: typeof sbAdmissions.sbListGuestAdmissionsByEvent;
  updateAdmissionStatus: typeof sbAdmissions.sbUpdateGuestAdmissionStatus;
  isConfigured?: () => boolean;
};

export const defaultGuestAdmissionDeps: GuestAdmissionDeps = {
  ...defaultGuestMeetingPreviewDeps,
  insertAdmission: sbAdmissions.sbInsertGuestAdmission,
  getAdmissionById: sbAdmissions.sbGetGuestAdmissionById,
  listAdmissionsByEvent: sbAdmissions.sbListGuestAdmissionsByEvent,
  updateAdmissionStatus: sbAdmissions.sbUpdateGuestAdmissionStatus,
  isConfigured: isSupabaseConfigured,
};

async function assertCanManageGuestAdmissions(
  session: SessionUser,
  eventId: string,
  deps: CalendarStoreDeps,
) {
  const eventResult = await handleGetCalendarEvent(session, eventId, deps);
  if ("status" in eventResult) {
    throw new MeetingAccessError("Forbidden", "forbidden");
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

export async function handleRequestGuestAdmission(
  inviteToken: string,
  displayNameInput: unknown,
  deps: GuestAdmissionDeps = defaultGuestAdmissionDeps,
  now: Date = new Date(),
): Promise<GuestAdmissionRequestResponse | GuestAdmissionHandlerError> {
  const displayName = normalizeGuestDisplayName(displayNameInput);
  if (!displayName) {
    return { status: 400, error: "Invalid display name" };
  }

  const preview = await resolveGuestMeetingPreview(inviteToken, deps, now);
  if ("error" in preview) {
    return { status: 404, error: "Invite link invalid" };
  }

  if (!isWithinMeetingWindow(preview.event, now)) {
    return { status: 403, error: "Meeting window closed" };
  }

  if (!(deps.isConfigured ?? isSupabaseConfigured)()) {
    return { status: 503, error: "Guest admissions not configured" };
  }

  if (!preview.event.guestWaitingRoom) {
    return { status: 400, error: "Waiting room disabled for this meeting" };
  }

  const invite = await deps.getInviteByToken(inviteToken.trim());
  if (!invite) {
    return { status: 404, error: "Invite link invalid" };
  }

  const guestId = `guest-${randomUUID()}`;
  const admission = await deps.insertAdmission({
    eventId: preview.event.id,
    inviteId: invite.id,
    guestId,
    displayName,
  });

  return {
    admissionId: admission.id,
    guestId: admission.guestId,
    status: "pending",
    waitingRoom: true,
  };
}

export async function handleGetGuestAdmissionStatus(
  admissionId: string,
  inviteToken: string,
  deps: GuestAdmissionDeps = defaultGuestAdmissionDeps,
): Promise<GuestAdmissionStatusResponse | GuestAdmissionHandlerError> {
  if (!(deps.isConfigured ?? isSupabaseConfigured)()) {
    return { status: 503, error: "Guest admissions not configured" };
  }

  const invite = await deps.getInviteByToken(inviteToken.trim());
  if (!invite) {
    return { status: 404, error: "Invite link invalid" };
  }

  const admission = await deps.getAdmissionById(admissionId);
  if (!admission || admission.inviteId !== invite.id) {
    return { status: 404, error: "Admission not found" };
  }

  return {
    admissionId: admission.id,
    guestId: admission.guestId,
    displayName: admission.displayName,
    status: admission.status,
  };
}

export async function handleListPendingGuestAdmissions(
  session: SessionUser,
  eventId: string,
  storeDeps: CalendarStoreDeps = defaultCalendarStoreDeps,
  deps: GuestAdmissionDeps = defaultGuestAdmissionDeps,
): Promise<
  { admissions: CalendarMeetingGuestAdmission[] } | GuestAdmissionHandlerError
> {
  try {
    await assertCanManageGuestAdmissions(session, eventId, storeDeps);
  } catch (error) {
    if (error instanceof MeetingAccessError) {
      return { status: 403, error: error.message };
    }
    throw error;
  }

  if (!(deps.isConfigured ?? isSupabaseConfigured)()) {
    return { status: 503, error: "Guest admissions not configured" };
  }

  const admissions = await deps.listAdmissionsByEvent(eventId, "pending");
  return { admissions };
}

export async function handleDecideGuestAdmission(
  session: SessionUser,
  eventId: string,
  admissionId: string,
  decision: "admit" | "reject",
  storeDeps: CalendarStoreDeps = defaultCalendarStoreDeps,
  deps: GuestAdmissionDeps = defaultGuestAdmissionDeps,
): Promise<
  { admission: CalendarMeetingGuestAdmission } | GuestAdmissionHandlerError
> {
  try {
    await assertCanManageGuestAdmissions(session, eventId, storeDeps);
  } catch (error) {
    if (error instanceof MeetingAccessError) {
      return { status: 403, error: error.message };
    }
    throw error;
  }

  if (!(deps.isConfigured ?? isSupabaseConfigured)()) {
    return { status: 503, error: "Guest admissions not configured" };
  }

  const admission = await deps.getAdmissionById(admissionId);
  if (!admission || admission.eventId !== eventId) {
    return { status: 404, error: "Admission not found" };
  }

  if (admission.status !== "pending") {
    return { status: 400, error: "Admission already decided" };
  }

  const updated = await deps.updateAdmissionStatus({
    id: admissionId,
    status: decision === "admit" ? "admitted" : "rejected",
    decidedByUserId: session.id,
  });

  if (!updated) {
    return { status: 404, error: "Admission not found" };
  }

  return { admission: updated };
}

export async function assertGuestAdmissionForToken(
  eventId: string,
  admissionId: string,
  guestId: string,
  deps: GuestAdmissionDeps = defaultGuestAdmissionDeps,
): Promise<CalendarMeetingGuestAdmission | GuestAdmissionHandlerError> {
  if (!isGuestParticipantId(guestId)) {
    return { status: 400, error: "Invalid guest identity" };
  }

  const admission = await deps.getAdmissionById(admissionId);
  if (!admission || admission.eventId !== eventId) {
    return { status: 404, error: "Admission not found" };
  }

  if (admission.guestId !== guestId) {
    return { status: 403, error: "Guest identity mismatch" };
  }

  if (admission.status !== "admitted") {
    return { status: 403, error: "Guest not admitted yet" };
  }

  return admission;
}
