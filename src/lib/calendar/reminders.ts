import {
  REMINDER_CRON_WINDOW_MS,
  REMINDER_GRACE_WINDOW_MS,
  REMINDER_OFFSETS_MINUTES,
  type ReminderOffsetMinutes,
} from "./constants";
import { getZonedDayStartFromIso } from "./range";
import { resolveVideoMeetingReminderRecipientIds } from "./participants";
import type { CalendarEvent } from "./types";

export type ReminderWindowOptions = {
  graceWindowMs?: number;
  cronWindowMs?: number;
};

export function computeEffectiveStartMs(
  event: Pick<CalendarEvent, "startAt" | "allDay">,
): number {
  if (event.allDay) {
    return getZonedDayStartFromIso(event.startAt).getTime();
  }
  return Date.parse(event.startAt);
}

export function computeFireTargetMs(
  effectiveStartMs: number,
  offsetMinutes: ReminderOffsetMinutes,
): number {
  return effectiveStartMs - offsetMinutes * 60_000;
}

export function isFireTargetInWindow(
  fireTargetMs: number,
  nowMs: number,
  opts: ReminderWindowOptions = {},
): boolean {
  const graceWindowMs = opts.graceWindowMs ?? REMINDER_GRACE_WINDOW_MS;
  const cronWindowMs = opts.cronWindowMs ?? REMINDER_CRON_WINDOW_MS;
  const windowStart = nowMs - graceWindowMs;
  const windowEnd = nowMs + cronWindowMs;
  return fireTargetMs >= windowStart && fireTargetMs <= windowEnd;
}

export type ReminderSkipReason =
  | "reminders_disabled"
  | "event_started"
  | "fire_target_too_early"
  | "fire_target_too_late";

export type ReminderDeliveryCandidate = {
  offsetMinutes: ReminderOffsetMinutes;
  effectiveStartMs: number;
  fireTargetMs: number;
};

export function getReminderDeliveryCandidate(
  event: CalendarEvent,
  offsetMinutes: ReminderOffsetMinutes,
  nowMs: number,
  opts: ReminderWindowOptions = {},
): ReminderDeliveryCandidate | ReminderSkipReason {
  if (!event.sendReminders) {
    return "reminders_disabled";
  }

  const effectiveStartMs = computeEffectiveStartMs(event);
  if (effectiveStartMs <= nowMs) {
    return "event_started";
  }

  const fireTargetMs = computeFireTargetMs(effectiveStartMs, offsetMinutes);
  if (fireTargetMs > nowMs + (opts.cronWindowMs ?? REMINDER_CRON_WINDOW_MS)) {
    return "fire_target_too_early";
  }
  if (fireTargetMs < nowMs - (opts.graceWindowMs ?? REMINDER_GRACE_WINDOW_MS)) {
    return "fire_target_too_late";
  }

  return { offsetMinutes, effectiveStartMs, fireTargetMs };
}

export function getEventScanRangeIso(
  nowMs: number,
  opts: ReminderWindowOptions = {},
): { from: string; to: string } {
  const graceWindowMs = opts.graceWindowMs ?? REMINDER_GRACE_WINDOW_MS;
  const cronWindowMs = opts.cronWindowMs ?? REMINDER_CRON_WINDOW_MS;

  let minStartMs = Number.POSITIVE_INFINITY;
  let maxStartMs = Number.NEGATIVE_INFINITY;

  for (const offsetMinutes of REMINDER_OFFSETS_MINUTES) {
    minStartMs = Math.min(
      minStartMs,
      nowMs - graceWindowMs + offsetMinutes * 60_000,
    );
    maxStartMs = Math.max(
      maxStartMs,
      nowMs + cronWindowMs + offsetMinutes * 60_000,
    );
  }

  return {
    from: new Date(minStartMs).toISOString(),
    to: new Date(maxStartMs).toISOString(),
  };
}

export function resolveReminderRecipientIds(
  event: CalendarEvent,
  activeUserIds: string[],
): string[] {
  if (event.eventType === "video_meeting") {
    return resolveVideoMeetingReminderRecipientIds(event, activeUserIds);
  }

  if (event.scope === "personal") {
    if (!event.ownerUserId) return [];
    return activeUserIds.includes(event.ownerUserId) ? [event.ownerUserId] : [];
  }

  return [...activeUserIds];
}

export function listReminderOffsetsForEvent(
  event: CalendarEvent,
  nowMs: number,
  opts: ReminderWindowOptions = {},
): ReminderDeliveryCandidate[] {
  const candidates: ReminderDeliveryCandidate[] = [];

  for (const offsetMinutes of REMINDER_OFFSETS_MINUTES) {
    const result = getReminderDeliveryCandidate(event, offsetMinutes, nowMs, opts);
    if (typeof result === "string") continue;
    candidates.push(result);
  }

  return candidates;
}
