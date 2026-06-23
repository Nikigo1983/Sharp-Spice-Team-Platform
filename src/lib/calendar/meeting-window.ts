import type { CalendarEvent } from "./types";

export const MEETING_EARLY_MINUTES = 15;
export const MEETING_LATE_MINUTES = 15;

export type MeetingAccessPhase = "waiting" | "open" | "closed";

export function getMeetingAccessWindow(
  event: Pick<CalendarEvent, "startAt" | "endAt">,
): { opensAt: Date; closesAt: Date } {
  const startMs = Date.parse(event.startAt);
  const endMs = Date.parse(event.endAt);
  return {
    opensAt: new Date(startMs - MEETING_EARLY_MINUTES * 60_000),
    closesAt: new Date(endMs + MEETING_LATE_MINUTES * 60_000),
  };
}

export function isWithinMeetingWindow(
  event: Pick<CalendarEvent, "startAt" | "endAt">,
  now: Date = new Date(),
): boolean {
  const { opensAt, closesAt } = getMeetingAccessWindow(event);
  const t = now.getTime();
  return t >= opensAt.getTime() && t <= closesAt.getTime();
}

export function getMeetingAccessPhase(
  event: Pick<CalendarEvent, "startAt" | "endAt">,
  now: Date = new Date(),
): MeetingAccessPhase {
  const { opensAt, closesAt } = getMeetingAccessWindow(event);
  const t = now.getTime();
  if (t < opensAt.getTime()) {
    return "waiting";
  }
  if (t > closesAt.getTime()) {
    return "closed";
  }
  return "open";
}

export function formatMeetingOpensAtLabel(
  event: Pick<CalendarEvent, "startAt" | "endAt">,
  timeZone: string,
): string {
  const { opensAt } = getMeetingAccessWindow(event);
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(opensAt);
}
