import { CALENDAR_SCOPES } from "./types";
import type {
  CalendarEvent,
  CalendarScope,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "./types";

export class CalendarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarValidationError";
  }
}

function isCalendarScope(value: string): value is CalendarScope {
  return CALENDAR_SCOPES.includes(value as CalendarScope);
}

function assertValidIsoTimestamp(value: string, field: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new CalendarValidationError(`${field} is required`);
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new CalendarValidationError(`${field} must be a valid ISO timestamp`);
  }
}

function assertEventTiming(
  event: Pick<CalendarEvent, "scope" | "ownerUserId" | "title" | "startAt" | "endAt">,
): void {
  const title = event.title.trim();
  if (!title) {
    throw new CalendarValidationError("Title is required");
  }

  if (!isCalendarScope(event.scope)) {
    throw new CalendarValidationError("Invalid scope");
  }

  if (event.scope === "personal" && !event.ownerUserId?.trim()) {
    throw new CalendarValidationError("Personal events require ownerUserId");
  }

  assertValidIsoTimestamp(event.startAt, "startAt");
  assertValidIsoTimestamp(event.endAt, "endAt");

  if (event.endAt < event.startAt) {
    throw new CalendarValidationError(
      "endAt must be greater than or equal to startAt",
    );
  }
}

function assertOptionalBoolean(value: unknown, field: string): void {
  if (value === undefined) return;
  if (typeof value !== "boolean") {
    throw new CalendarValidationError(`${field} must be a boolean`);
  }
}

export function parseIsoRange(
  from: string,
  to: string,
): { from: string; to: string } {
  assertValidIsoTimestamp(from, "from");
  assertValidIsoTimestamp(to, "to");

  if (to <= from) {
    throw new CalendarValidationError("to must be after from");
  }

  return { from: from.trim(), to: to.trim() };
}

export function validateCreateInput(input: CreateCalendarEventInput): void {
  if (!input.createdByUserId?.trim()) {
    throw new CalendarValidationError("createdByUserId is required");
  }
  if (!input.createdByName?.trim()) {
    throw new CalendarValidationError("createdByName is required");
  }

  assertEventTiming({
    scope: input.scope,
    ownerUserId: input.scope === "personal" ? input.ownerUserId : null,
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
  });
  assertOptionalBoolean(input.sendReminders, "sendReminders");
}

export function validateUpdateInput(
  existing: CalendarEvent,
  input: UpdateCalendarEventInput,
): void {
  assertEventTiming({
    scope: existing.scope,
    ownerUserId: existing.ownerUserId,
    title: input.title !== undefined ? input.title : existing.title,
    startAt: input.startAt ?? existing.startAt,
    endAt: input.endAt ?? existing.endAt,
  });
  assertOptionalBoolean(input.sendReminders, "sendReminders");
}
