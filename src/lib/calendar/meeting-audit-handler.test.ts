import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUser } from "@/lib/auth/types";
import type {
  CalendarEvent,
  CalendarMeetingAudit,
  CreateCalendarEventInput,
  InsertCalendarMeetingAuditInput,
} from "./types";
import {
  handleRecordMeetingAudit,
  parseMeetingAuditAction,
  type MeetingAuditDeps,
} from "./meeting-audit-handler";
import type { CalendarStoreDeps } from "./handlers";

const managerA: SessionUser = {
  id: "manager-1",
  name: "Злата",
  email: "manager1@test.com",
  role: "manager",
};

const managerB: SessionUser = {
  id: "manager-2",
  name: "Юля",
  email: "manager2@test.com",
  role: "manager",
};

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-video",
    companyId: "sharp-spice",
    scope: "personal",
    ownerUserId: managerA.id,
    title: "Sync",
    description: "",
    eventType: "video_meeting",
    startAt: "2026-06-25T08:00:00.000Z",
    endAt: "2026-06-25T08:30:00.000Z",
    allDay: false,
    location: "",
    sendReminders: true,
    createdByUserId: managerA.id,
    createdByName: managerA.name,
    updatedByUserId: null,
    createdAt: "2026-06-20T10:00:00.000Z",
    updatedAt: "2026-06-20T10:00:00.000Z",
    ...overrides,
  };
}

function createMemoryStore(initial: CalendarEvent[] = []): CalendarStoreDeps {
  const events = new Map(initial.map((item) => [item.id, item]));

  return {
    async listEventsInRange() {
      return [...events.values()];
    },
    async getEvent(id) {
      return events.get(id) ?? null;
    },
    async createEvent(input: CreateCalendarEventInput) {
      const created = event({
        id: `evt-${events.size + 1}`,
        scope: input.scope,
        ownerUserId: input.scope === "personal" ? input.ownerUserId : null,
        title: input.title.trim(),
        description: input.description?.trim() ?? "",
        eventType: input.eventType ?? "general",
        startAt: input.startAt,
        endAt: input.endAt,
        allDay: input.allDay ?? false,
        location: input.location?.trim() ?? "",
        sendReminders: input.sendReminders ?? true,
        createdByUserId: input.createdByUserId,
        createdByName: input.createdByName,
      });
      events.set(created.id, created);
      return created;
    },
    async updateEvent(updated) {
      events.set(updated.id, updated);
      return updated;
    },
    async deleteEvent(id) {
      return events.delete(id);
    },
  };
}

function createAuditDeps(
  rows: CalendarMeetingAudit[] = [],
): MeetingAuditDeps {
  return {
    isConfigured: () => true,
    async insertAudit(input: InsertCalendarMeetingAuditInput) {
      const row: CalendarMeetingAudit = {
        id: `audit-${rows.length + 1}`,
        eventId: input.eventId,
        userId: input.userId,
        userName: input.userName,
        roomName: input.roomName,
        action: input.action,
        occurredAt: new Date().toISOString(),
      };
      rows.push(row);
      return row;
    },
  };
}

describe("parseMeetingAuditAction", () => {
  it("accepts joined and left", () => {
    assert.equal(parseMeetingAuditAction({ action: "joined" }), "joined");
    assert.equal(parseMeetingAuditAction({ action: "left" }), "left");
  });

  it("rejects invalid actions", () => {
    assert.throws(() => parseMeetingAuditAction({ action: "pause" }));
    assert.throws(() => parseMeetingAuditAction(null));
  });
});

describe("handleRecordMeetingAudit", () => {
  it("returns 404 for unknown event", async () => {
    const result = await handleRecordMeetingAudit(
      managerA,
      "missing",
      "joined",
      createMemoryStore(),
      createAuditDeps(),
      new Date("2026-06-25T08:10:00.000Z"),
    );

    assert.equal("status" in result && result.status, 404);
  });

  it("returns 403 for joined outside meeting window", async () => {
    const deps = createMemoryStore([event()]);
    const result = await handleRecordMeetingAudit(
      managerA,
      "evt-video",
      "joined",
      deps,
      createAuditDeps(),
      new Date("2026-06-25T07:30:00.000Z"),
    );

    assert.equal("status" in result && result.status, 403);
  });

  it("allows left outside meeting window", async () => {
    const rows: CalendarMeetingAudit[] = [];
    const deps = createMemoryStore([event()]);
    const result = await handleRecordMeetingAudit(
      managerA,
      "evt-video",
      "left",
      deps,
      createAuditDeps(rows),
      new Date("2026-06-25T09:00:00.000Z"),
    );

    assert.ok(!("status" in result));
    if ("status" in result) return;
    assert.equal(result.audit.action, "left");
    assert.equal(result.audit.roomName, "sharp-spice-cal-evt-video");
    assert.equal(rows.length, 1);
  });

  it("returns 403 for another user's personal event", async () => {
    const result = await handleRecordMeetingAudit(
      managerB,
      "evt-video",
      "joined",
      createMemoryStore([event()]),
      createAuditDeps(),
      new Date("2026-06-25T08:10:00.000Z"),
    );

    assert.equal("status" in result && result.status, 404);
  });

  it("records joined audit in window", async () => {
    const rows: CalendarMeetingAudit[] = [];
    const result = await handleRecordMeetingAudit(
      managerA,
      "evt-video",
      "joined",
      createMemoryStore([event()]),
      createAuditDeps(rows),
      new Date("2026-06-25T08:10:00.000Z"),
    );

    assert.ok(!("status" in result));
    if ("status" in result) return;
    assert.equal(result.audit.userId, managerA.id);
    assert.equal(result.audit.userName, managerA.name);
    assert.equal(result.audit.action, "joined");
  });
});
