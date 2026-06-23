import type { SessionUser } from "@/lib/auth/types";
import {
  canCreateWithScope,
  canDeleteEvent,
  canEditEvent,
  canViewEvent,
} from "./permissions";
import {
  createEvent,
  deleteEvent,
  getEvent,
  listEventsInRange,
  updateEvent,
} from "./store";
import type {
  CalendarEvent,
  CalendarScope,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "./types";
import { CALENDAR_SCOPES } from "./types";
import {
  CalendarValidationError,
  parseIsoRange,
  validateCreateInput,
  validateUpdateInput,
} from "./validation";

export type CalendarHandlerError = {
  status: 400 | 403 | 404 | 422;
  error: string;
};

export type CalendarStoreDeps = {
  listEventsInRange: typeof listEventsInRange;
  getEvent: typeof getEvent;
  createEvent: typeof createEvent;
  updateEvent: typeof updateEvent;
  deleteEvent: typeof deleteEvent;
};

export const defaultCalendarStoreDeps: CalendarStoreDeps = {
  listEventsInRange,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
};

function isCalendarScope(value: string): value is CalendarScope {
  return CALENDAR_SCOPES.includes(value as CalendarScope);
}

export function parseScopesParam(raw: string | null): CalendarScope[] {
  if (!raw?.trim()) {
    return ["personal", "company"];
  }

  const scopes = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter(isCalendarScope);

  if (scopes.length === 0) {
    throw new CalendarValidationError("Invalid scopes parameter");
  }

  return [...new Set(scopes)];
}

function parseCreateBody(body: unknown): Omit<
  CreateCalendarEventInput,
  "ownerUserId" | "createdByUserId" | "createdByName"
> {
  if (!body || typeof body !== "object") {
    throw new CalendarValidationError("Invalid request body");
  }

  const record = body as Record<string, unknown>;
  const scope = record.scope;
  if (typeof scope !== "string" || !isCalendarScope(scope)) {
    throw new CalendarValidationError("Invalid scope");
  }

  if (typeof record.title !== "string") {
    throw new CalendarValidationError("Title is required");
  }
  if (typeof record.startAt !== "string") {
    throw new CalendarValidationError("startAt is required");
  }
  if (typeof record.endAt !== "string") {
    throw new CalendarValidationError("endAt is required");
  }

  return {
    scope,
    title: record.title,
    description:
      typeof record.description === "string" ? record.description : undefined,
    startAt: record.startAt,
    endAt: record.endAt,
    allDay: typeof record.allDay === "boolean" ? record.allDay : undefined,
    location: typeof record.location === "string" ? record.location : undefined,
    sendReminders:
      typeof record.sendReminders === "boolean"
        ? record.sendReminders
        : undefined,
  };
}

const UPDATE_FIELDS = new Set([
  "title",
  "description",
  "startAt",
  "endAt",
  "allDay",
  "location",
  "sendReminders",
]);

function parseUpdateBody(body: unknown): UpdateCalendarEventInput {
  if (!body || typeof body !== "object") {
    throw new CalendarValidationError("Invalid request body");
  }

  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!UPDATE_FIELDS.has(key)) {
      throw new CalendarValidationError(`Field "${key}" cannot be updated`);
    }
  }

  const input: UpdateCalendarEventInput = {};

  if ("title" in record) {
    if (typeof record.title !== "string") {
      throw new CalendarValidationError("title must be a string");
    }
    input.title = record.title;
  }
  if ("description" in record) {
    if (typeof record.description !== "string") {
      throw new CalendarValidationError("description must be a string");
    }
    input.description = record.description;
  }
  if ("startAt" in record) {
    if (typeof record.startAt !== "string") {
      throw new CalendarValidationError("startAt must be a string");
    }
    input.startAt = record.startAt;
  }
  if ("endAt" in record) {
    if (typeof record.endAt !== "string") {
      throw new CalendarValidationError("endAt must be a string");
    }
    input.endAt = record.endAt;
  }
  if ("allDay" in record) {
    if (typeof record.allDay !== "boolean") {
      throw new CalendarValidationError("allDay must be a boolean");
    }
    input.allDay = record.allDay;
  }
  if ("location" in record) {
    if (typeof record.location !== "string") {
      throw new CalendarValidationError("location must be a string");
    }
    input.location = record.location;
  }
  if ("sendReminders" in record) {
    if (typeof record.sendReminders !== "boolean") {
      throw new CalendarValidationError("sendReminders must be a boolean");
    }
    input.sendReminders = record.sendReminders;
  }

  if (Object.keys(input).length === 0) {
    throw new CalendarValidationError("No updatable fields provided");
  }

  return input;
}

function toHandlerError(error: unknown): CalendarHandlerError {
  if (error instanceof CalendarValidationError) {
    return { status: 422, error: error.message };
  }
  return { status: 422, error: "Invalid request" };
}

export async function handleListCalendarEvents(
  session: SessionUser,
  from: string | null,
  to: string | null,
  scopesRaw: string | null,
  deps: CalendarStoreDeps = defaultCalendarStoreDeps,
): Promise<{ events: CalendarEvent[] } | CalendarHandlerError> {
  if (!from || !to) {
    return { status: 422, error: "from and to query parameters are required" };
  }

  try {
    const range = parseIsoRange(from, to);
    const scopes = parseScopesParam(scopesRaw);
    const events = await deps.listEventsInRange({
      from: range.from,
      to: range.to,
      scopes,
      ownerUserId: session.id,
    });
    return { events };
  } catch (error) {
    return toHandlerError(error);
  }
}

export async function handleCreateCalendarEvent(
  session: SessionUser,
  body: unknown,
  deps: CalendarStoreDeps = defaultCalendarStoreDeps,
): Promise<{ event: CalendarEvent } | CalendarHandlerError> {
  try {
    const parsed = parseCreateBody(body);

    if (!canCreateWithScope(session, parsed.scope)) {
      return { status: 403, error: "Forbidden" };
    }

    const input: CreateCalendarEventInput = {
      ...parsed,
      ownerUserId: parsed.scope === "personal" ? session.id : null,
      createdByUserId: session.id,
      createdByName: session.name,
    };

    validateCreateInput(input);
    const event = await deps.createEvent(input);
    return { event };
  } catch (error) {
    return toHandlerError(error);
  }
}

export async function handleGetCalendarEvent(
  session: SessionUser,
  id: string,
  deps: CalendarStoreDeps = defaultCalendarStoreDeps,
): Promise<{ event: CalendarEvent } | CalendarHandlerError> {
  const event = await deps.getEvent(id);
  if (!event || !canViewEvent(session, event)) {
    return { status: 404, error: "Not found" };
  }
  return { event };
}

export async function handleUpdateCalendarEvent(
  session: SessionUser,
  id: string,
  body: unknown,
  deps: CalendarStoreDeps = defaultCalendarStoreDeps,
): Promise<{ event: CalendarEvent } | CalendarHandlerError> {
  const existing = await deps.getEvent(id);
  if (!existing || !canViewEvent(session, existing)) {
    return { status: 404, error: "Not found" };
  }

  if (!canEditEvent(session, existing)) {
    return { status: 403, error: "Forbidden" };
  }

  try {
    const input = parseUpdateBody(body);
    validateUpdateInput(existing, input);
    const event = await deps.updateEvent(id, {
      ...input,
      updatedByUserId: session.id,
    });
    if (!event) {
      return { status: 404, error: "Not found" };
    }
    return { event };
  } catch (error) {
    return toHandlerError(error);
  }
}

export async function handleDeleteCalendarEvent(
  session: SessionUser,
  id: string,
  deps: CalendarStoreDeps = defaultCalendarStoreDeps,
): Promise<{ ok: true } | CalendarHandlerError> {
  const existing = await deps.getEvent(id);
  if (!existing || !canViewEvent(session, existing)) {
    return { status: 404, error: "Not found" };
  }

  if (!canDeleteEvent(session, existing)) {
    return { status: 403, error: "Forbidden" };
  }

  const ok = await deps.deleteEvent(id);
  if (!ok) {
    return { status: 404, error: "Not found" };
  }

  return { ok: true };
}
