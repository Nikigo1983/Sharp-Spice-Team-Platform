import { listTeamUsers } from "@/lib/auth/users";
import type { SessionUser } from "@/lib/auth/types";
import type { CalendarEvent, VideoInviteMode } from "./types";

export function getEffectiveVideoInviteMode(
  event: CalendarEvent,
): VideoInviteMode | null {
  if (event.eventType !== "video_meeting") {
    return null;
  }
  if (event.videoInviteMode) {
    return event.videoInviteMode;
  }
  return event.scope === "company" ? "all_team" : null;
}

export function normalizeParticipantUserIds(
  raw: string[] | undefined,
  creatorUserId: string,
): string[] {
  const teamIds = new Set(listTeamUsers().map((user) => user.id));
  const ids = new Set<string>();

  for (const value of raw ?? []) {
    const id = value.trim();
    if (!id || id === creatorUserId || !teamIds.has(id)) {
      continue;
    }
    ids.add(id);
  }

  return [...ids].sort();
}

export function isUserInvitedToVideoMeeting(
  userId: string,
  event: CalendarEvent,
): boolean {
  if (event.eventType !== "video_meeting") {
    return false;
  }

  if (event.createdByUserId === userId) {
    return true;
  }

  if (event.scope === "personal" && event.ownerUserId === userId) {
    return true;
  }

  const mode = getEffectiveVideoInviteMode(event);

  if (mode === "all_team" && event.scope === "company") {
    return true;
  }

  if (mode === "selected") {
    return (event.participantUserIds ?? []).includes(userId);
  }

  if (event.scope === "personal") {
    return event.ownerUserId === userId;
  }

  if (event.scope === "company") {
    return true;
  }

  return false;
}

export function canViewVideoMeeting(
  user: Pick<SessionUser, "id">,
  event: CalendarEvent,
): boolean {
  return isUserInvitedToVideoMeeting(user.id, event);
}

export function resolveVideoMeetingReminderRecipientIds(
  event: CalendarEvent,
  activeUserIds: string[],
): string[] {
  const mode = getEffectiveVideoInviteMode(event);

  if (mode === "all_team" && event.scope === "company") {
    return [...activeUserIds];
  }

  if (mode === "selected" || event.scope === "personal") {
    const invited = new Set<string>();
    invited.add(event.createdByUserId);
    if (event.ownerUserId) {
      invited.add(event.ownerUserId);
    }
    for (const userId of event.participantUserIds ?? []) {
      invited.add(userId);
    }
    return activeUserIds.filter((userId) => invited.has(userId));
  }

  return [...activeUserIds];
}

export function formatParticipantNames(
  event: CalendarEvent,
  teamMembers: { id: string; name: string }[],
): string {
  const mode = getEffectiveVideoInviteMode(event);

  if (mode === "all_team" && event.scope === "company") {
    return "Вся команда";
  }

  const namesById = new Map(teamMembers.map((member) => [member.id, member.name]));
  const names = new Set<string>();

  const creatorName = namesById.get(event.createdByUserId);
  if (creatorName) {
    names.add(creatorName);
  }

  for (const userId of event.participantUserIds ?? []) {
    const name = namesById.get(userId);
    if (name) {
      names.add(name);
    }
  }

  if (names.size === 0) {
    return creatorName ?? "Только организатор";
  }

  return [...names].join(", ");
}
