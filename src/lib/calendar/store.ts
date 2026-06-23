import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  CALENDAR_COMPANY_ID,
  CALENDAR_DEFAULT_EVENT_TYPE,
  CALENDAR_DEFAULT_SEND_REMINDERS,
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
import {
  deleteReminderDeliveriesByEventId,
  shouldResetReminderDeliveriesOnUpdate,
} from "./reminder-deliveries-lifecycle";
import { canViewEvent } from "./permissions";
import { isUserInvitedToVideoMeeting, normalizeParticipantUserIds } from "./participants";
import {
  listParticipantUserIdsByEventIds,
  replaceEventParticipants,
} from "./participants-store";
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
  const viewerUserId = opts.viewerUserId ?? opts.ownerUserId;

  return events
    .filter((event) => eventOverlapsRange(event, opts.from, opts.to))
    .filter((event) => {
      if (!viewerUserId) {
        return false;
      }

      const viewer = { id: viewerUserId } as Parameters<typeof canViewEvent>[0];
      if (!canViewEvent(viewer, event)) {
        return false;
      }

      const invitedPersonalVideo =
        event.eventType === "video_meeting" &&
        event.scope === "personal" &&
        isUserInvitedToVideoMeeting(viewerUserId, event) &&
        event.ownerUserId !== viewerUserId;

      if (invitedPersonalVideo) {
        return true;
      }

      if (event.scope === "company") {
        return includeCompany;
      }

      return includePersonal;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

async function attachParticipants(events: CalendarEvent[]): Promise<CalendarEvent[]> {
  const videoEventIds = events
    .filter((event) => event.eventType === "video_meeting")
    .map((event) => event.id);

  if (videoEventIds.length === 0) {
    return events.map((event) => ({
      ...event,
      participantUserIds: event.participantUserIds ?? [],
    }));
  }

  const participantMap = await listParticipantUserIdsByEventIds(videoEventIds);

  return events.map((event) => ({
    ...event,
    participantUserIds:
      event.eventType === "video_meeting"
        ? (participantMap.get(event.id) ?? [])
        : [],
  }));
}

async function readStore(): Promise<CalendarEventStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as CalendarEventStore;
    if (!Array.isArray(data.events)) return { events: [] };
    return {
      events: data.events.map((item) =>
        normalizeEvent(item as CalendarEvent),
      ),
    };
  } catch {
    return { events: [] };
  }
}

async function writeStore(store: CalendarEventStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  store.events.sort((a, b) => a.startAt.localeCompare(b.startAt));
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function normalizeEvent(event: CalendarEvent): CalendarEvent {
  return {
    ...event,
    videoInviteMode: event.videoInviteMode ?? null,
    participantUserIds: event.participantUserIds ?? [],
    sendReminders: event.sendReminders ?? CALENDAR_DEFAULT_SEND_REMINDERS,
  };
}

function resolveVideoInviteForCreate(
  input: CreateCalendarEventInput,
): {
  videoInviteMode: CalendarEvent["videoInviteMode"];
  participantUserIds: string[];
} {
  if (input.eventType !== "video_meeting") {
    return { videoInviteMode: null, participantUserIds: [] };
  }

  if (input.scope === "personal") {
    return {
      videoInviteMode: "selected",
      participantUserIds: normalizeParticipantUserIds(
        input.participantUserIds,
        input.createdByUserId,
      ),
    };
  }

  const mode = input.videoInviteMode === "selected" ? "selected" : "all_team";
  if (mode === "all_team") {
    return { videoInviteMode: "all_team", participantUserIds: [] };
  }

  return {
    videoInviteMode: "selected",
    participantUserIds: normalizeParticipantUserIds(
      input.participantUserIds,
      input.createdByUserId,
    ),
  };
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
      const enriched = await attachParticipants(events.map(normalizeEvent));
      return filterEventsForList(enriched, opts);
    } catch (error) {
      console.error("[calendar] supabase list", error);
      return [];
    }
  }

  const store = await readStore();
  const enriched = await attachParticipants(store.events.map(normalizeEvent));
  return filterEventsForList(enriched, opts);
}

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  let event: CalendarEvent | null = null;

  if (isSupabaseConfigured()) {
    try {
      event = await sbCalendar.sbGetCalendarEvent(id);
    } catch (error) {
      console.error("[calendar] supabase get", error);
      return null;
    }
  } else {
    const store = await readStore();
    event = store.events.find((item) => item.id === id) ?? null;
  }

  if (!event) {
    return null;
  }

  const [enriched] = await attachParticipants([normalizeEvent(event)]);
  return enriched ?? null;
}

export async function listEventsInRangeForReminders(
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  if (isSupabaseConfigured()) {
    try {
      return await sbCalendar.sbListEventsInRange(
        CALENDAR_COMPANY_ID,
        from,
        to,
      ).then(async (events) => {
        const normalized = events.map(normalizeEvent);
        return attachParticipants(normalized);
      });
    } catch (error) {
      console.error("[calendar] supabase list for reminders", error);
      return [];
    }
  }

  const store = await readStore();
  const overlapping = store.events
    .filter((event) => eventOverlapsRange(event, from, to))
    .map(normalizeEvent);
  return attachParticipants(overlapping);
}

export async function createEvent(
  input: CreateCalendarEventInput,
): Promise<CalendarEvent> {
  validateCreateInput(input);

  const now = new Date().toISOString();
  const { videoInviteMode, participantUserIds } = resolveVideoInviteForCreate(input);
  const event: CalendarEvent = {
    id: randomUUID(),
    companyId: CALENDAR_COMPANY_ID,
    scope: input.scope,
    ownerUserId: input.scope === "personal" ? input.ownerUserId : null,
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    eventType: input.eventType ?? CALENDAR_DEFAULT_EVENT_TYPE,
    videoInviteMode,
    participantUserIds,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay ?? false,
    location: input.location?.trim() ?? "",
    sendReminders: input.sendReminders ?? CALENDAR_DEFAULT_SEND_REMINDERS,
    createdByUserId: input.createdByUserId,
    createdByName: input.createdByName,
    updatedByUserId: null,
    createdAt: now,
    updatedAt: now,
  };

  if (isSupabaseConfigured()) {
    try {
      const created = await sbCalendar.sbInsertCalendarEvent({
        ...event,
        participantUserIds: [],
      });
      if (videoInviteMode === "selected") {
        await replaceEventParticipants(created.id, participantUserIds);
      }
      return {
        ...created,
        participantUserIds,
      };
    } catch (error) {
      console.error("[calendar] supabase create", error);
      throw error;
    }
  }

  const store = await readStore();
  store.events.push(event);
  await writeStore(store);
  if (videoInviteMode === "selected") {
    await replaceEventParticipants(event.id, participantUserIds);
  }
  return event;
}

export async function updateEvent(
  id: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEvent | null> {
  const existing = await getEvent(id);
  if (!existing) return null;

  const rawExisting = { ...existing, participantUserIds: existing.participantUserIds ?? [] };
  let nextInviteMode = rawExisting.videoInviteMode;
  let nextParticipantUserIds = rawExisting.participantUserIds;

  if (rawExisting.eventType === "video_meeting") {
    if (input.videoInviteMode !== undefined) {
      nextInviteMode =
        rawExisting.scope === "personal"
          ? "selected"
          : input.videoInviteMode === "selected"
            ? "selected"
            : "all_team";
    }

    if (input.participantUserIds !== undefined || input.videoInviteMode !== undefined) {
      if (nextInviteMode === "all_team") {
        nextParticipantUserIds = [];
      } else {
        nextParticipantUserIds = normalizeParticipantUserIds(
          input.participantUserIds ?? rawExisting.participantUserIds,
          rawExisting.createdByUserId,
        );
      }
    }
  }

  const updated: CalendarEvent = {
    ...rawExisting,
    title: input.title !== undefined ? input.title.trim() : rawExisting.title,
    description:
      input.description !== undefined
        ? input.description.trim()
        : rawExisting.description,
    startAt: input.startAt ?? rawExisting.startAt,
    endAt: input.endAt ?? rawExisting.endAt,
    allDay: input.allDay ?? rawExisting.allDay,
    location:
      input.location !== undefined ? input.location.trim() : rawExisting.location,
    sendReminders:
      input.sendReminders !== undefined
        ? input.sendReminders
        : rawExisting.sendReminders,
    videoInviteMode: nextInviteMode,
    participantUserIds: nextParticipantUserIds,
    updatedByUserId:
      input.updatedByUserId !== undefined
        ? input.updatedByUserId
        : rawExisting.updatedByUserId,
    updatedAt: new Date().toISOString(),
  };

  validateUpdateInput(rawExisting, input);

  if (shouldResetReminderDeliveriesOnUpdate(rawExisting, input)) {
    await deleteReminderDeliveriesByEventId(id);
  }

  if (isSupabaseConfigured()) {
    try {
      const saved = await sbCalendar.sbUpdateCalendarEvent({
        ...updated,
        participantUserIds: [],
      });
      if (saved.eventType === "video_meeting") {
        if (nextInviteMode === "selected") {
          await replaceEventParticipants(saved.id, nextParticipantUserIds);
        } else {
          await replaceEventParticipants(saved.id, []);
        }
      }
      return {
        ...saved,
        participantUserIds: nextParticipantUserIds,
      };
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

  if (updated.eventType === "video_meeting") {
    if (nextInviteMode === "selected") {
      await replaceEventParticipants(id, nextParticipantUserIds);
    } else {
      await replaceEventParticipants(id, []);
    }
  }

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
