import "server-only";

import bcrypt from "bcryptjs";
import type { CalendarEvent } from "./types";

export const DEFAULT_GUEST_MAX_COUNT = 10;

export async function hashGuestAccessPassword(
  password: string,
): Promise<string> {
  return bcrypt.hash(password.trim(), 12);
}

export async function verifyGuestAccessPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    return true;
  }

  const trimmed = password.trim();
  if (!trimmed) {
    return false;
  }

  return bcrypt.compare(trimmed, hash);
}

export function eventRequiresGuestPassword(
  event: Pick<CalendarEvent, "guestAccessPasswordHash">,
): boolean {
  return Boolean(event.guestAccessPasswordHash?.trim());
}

export function resolveGuestMaxCount(
  event: Pick<CalendarEvent, "guestMaxCount">,
): number | null {
  return event.guestMaxCount;
}

export function isGuestLimitReached(
  activeCount: number,
  event: Pick<CalendarEvent, "guestMaxCount">,
): boolean {
  const limit = resolveGuestMaxCount(event);
  if (limit == null) {
    return false;
  }
  return activeCount >= limit;
}

export function normalizeGuestAccessPasswordInput(
  value: unknown,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function sanitizeCalendarEventForClient(
  event: CalendarEvent,
): CalendarEvent {
  return {
    ...event,
    guestAccessPasswordHash: null,
    guestAccessPasswordSet:
      event.guestAccessPasswordSet ?? Boolean(event.guestAccessPasswordHash),
  };
}
