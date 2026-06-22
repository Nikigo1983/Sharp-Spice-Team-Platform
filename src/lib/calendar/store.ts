import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  CALENDAR_COMPANY_ID,
  CALENDAR_DEFAULT_EVENT_TYPE,
} from "./constants";
import type {
  CalendarEvent,
  CreateCalendarEventInput,
  ListCalendarEventsOptions,
  UpdateCalendarEventInput,
} from "./types";
import {
  validateCreateInput,
  validateUpdateInput,
} from "./validation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbCalendar from "@/lib/supabase/calendar-events-repo";

const STORE_PATH = path.join(process.cwd(), ".data", "calendar-events.json");

type CalendarEventStore = {
  events: CalendarEvent[];
};

/** @deprecated Use CalendarValidationError from ./validation */
export { CalendarValidationError as CalendarStoreError } from "./validation";

function eventOverlapsRange(
  event: CalendarEvent,
  from: string,
  to: string,
): boolean {
  return event.startAt < to && event.endAt > from;
}

function filterEventsForList(
  events: CalendarEvent[],
  opts: ListCalendarEventsOptions,
): CalendarEvent[] {
  const scopes = opts.scopes ?? ["personal", "company"];
  const includePersonal = scopes.includes("personal");
  const includeCompany = scopes.includes("company");

  return events
    .filter((event) => eventOverlapsRange(event, opts.from, opts.to))
    .filter((event) => {
      if (event.scope === "company") {
        return includeCompany;
      }
      if (!includePersonal) return false;
      if (!opts.ownerUserId) return false;
      return event.ownerUserId === opts.ownerUserId;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

async function readStore(): Promise<CalendarEventStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as CalendarEventStore;
    if (!Array.isArray(data.events)) return { events: [] };
    return data;
  } catch {
    return { events: [] };
  }
}

async function writeStore(store: CalendarEventStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  store.events.sort((a, b) => a.startAt.localeCompare(b.startAt));
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function listEventsInRange(
  opts: ListCalendarEventsOptions,
): Promise<CalendarEvent[]> {
  if (isSupabaseConfigured()) {
    try {
      const events = await sbCalendar.sbListEventsInRange(
        CALENDAR_COMPANY_ID,
        opts.from,
        opts.to,
      );
      return filterEventsForList(events, opts);
    } catch (error) {
      console.error("[calendar] supabase list", error);
      return [];
    }
  }

  const store = await readStore();
  return filterEventsForList(store.events, opts);
}

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  if (isSupabaseConfigured()) {
    try {
      return await sbCalendar.sbGetCalendarEvent(id);
    } catch (error) {
      console.error("[calendar] supabase get", error);
      return null;
    }
  }

  const store = await readStore();
  return store.events.find((event) => event.id === id) ?? null;
}

export async function createEvent(
  input: CreateCalendarEventInput,
): Promise<CalendarEvent> {
  validateCreateInput(input);

  const now = new Date().toISOString();
  const event: CalendarEvent = {
    id: randomUUID(),
    companyId: CALENDAR_COMPANY_ID,
    scope: input.scope,
    ownerUserId: input.scope === "personal" ? input.ownerUserId : null,
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    eventType: input.eventType ?? CALENDAR_DEFAULT_EVENT_TYPE,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay ?? false,
    location: input.location?.trim() ?? "",
    createdByUserId: input.createdByUserId,
    createdByName: input.createdByName,
    updatedByUserId: null,
    createdAt: now,
    updatedAt: now,
  };

  if (isSupabaseConfigured()) {
    try {
      return await sbCalendar.sbInsertCalendarEvent(event);
    } catch (error) {
      console.error("[calendar] supabase create", error);
      throw error;
    }
  }

  const store = await readStore();
  store.events.push(event);
  await writeStore(store);
  return event;
}

export async function updateEvent(
  id: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEvent | null> {
  const existing = await getEvent(id);
  if (!existing) return null;

  const updated: CalendarEvent = {
    ...existing,
    title: input.title !== undefined ? input.title.trim() : existing.title,
    description:
      input.description !== undefined
        ? input.description.trim()
        : existing.description,
    startAt: input.startAt ?? existing.startAt,
    endAt: input.endAt ?? existing.endAt,
    allDay: input.allDay ?? existing.allDay,
    location:
      input.location !== undefined ? input.location.trim() : existing.location,
    updatedByUserId:
      input.updatedByUserId !== undefined
        ? input.updatedByUserId
        : existing.updatedByUserId,
    updatedAt: new Date().toISOString(),
  };

  validateUpdateInput(existing, input);

  if (isSupabaseConfigured()) {
    try {
      return await sbCalendar.sbUpdateCalendarEvent(updated);
    } catch (error) {
      console.error("[calendar] supabase update", error);
      throw error;
    }
  }

  const store = await readStore();
  const index = store.events.findIndex((event) => event.id === id);
  if (index < 0) return null;

  store.events[index] = updated;
  await writeStore(store);
  return updated;
}

export async function deleteEvent(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    try {
      const existing = await sbCalendar.sbGetCalendarEvent(id);
      if (!existing) return false;
      return await sbCalendar.sbDeleteCalendarEvent(id);
    } catch (error) {
      console.error("[calendar] supabase delete", error);
      throw error;
    }
  }

  const store = await readStore();
  const next = store.events.filter((event) => event.id !== id);
  if (next.length === store.events.length) return false;

  store.events = next;
  await writeStore(store);
  return true;
}
