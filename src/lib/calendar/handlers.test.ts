import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUser } from "@/lib/auth/types";
import type { CalendarEvent, CreateCalendarEventInput } from "./types";
import {
  handleCreateCalendarEvent,
  handleDeleteCalendarEvent,
  handleGetCalendarEvent,
  handleListCalendarEvents,
  handleUpdateCalendarEvent,
  parseScopesParam,
  type CalendarStoreDeps,
} from "./handlers";

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

const owner: SessionUser = {
  id: "veronika",
  name: "Вероника",
  email: "owner@test.com",
  role: "owner",
};

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    companyId: "sharp-spice",
    scope: "personal",
    ownerUserId: managerA.id,
    title: "Meeting",
    description: "",
    eventType: "general",
    startAt: "2026-06-20T08:00:00.000Z",
    endAt: "2026-06-20T09:00:00.000Z",
    allDay: false,
    location: "",
    sendReminders: true,
    createdByUserId: managerA.id,
    createdByName: managerA.name,
    updatedByUserId: null,
    createdAt: "2026-06-19T12:00:00.000Z",
    updatedAt: "2026-06-19T12:00:00.000Z",
    ...overrides,
  };
}

function createMemoryStore(initial: CalendarEvent[] = []): CalendarStoreDeps {
  const events = new Map(initial.map((item) => [item.id, item]));

  return {
    async listEventsInRange(opts) {
      return [...events.values()]
        .filter(
          (item) => item.startAt < opts.to && item.endAt > opts.from,
        )
        .filter((item) => {
          const scopes = opts.scopes ?? ["personal", "company"];
          if (item.scope === "company") {
            return scopes.includes("company");
          }
          return (
            scopes.includes("personal") &&
            opts.ownerUserId === item.ownerUserId
          );
        })
        .sort((a, b) => a.startAt.localeCompare(b.startAt));
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
    async updateEvent(id, input) {
      const existing = events.get(id);
      if (!existing) return null;
      const updated = event({
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
        sendReminders:
          input.sendReminders !== undefined
            ? input.sendReminders
            : existing.sendReminders,
        updatedByUserId: input.updatedByUserId ?? existing.updatedByUserId,
        updatedAt: new Date().toISOString(),
      });
      events.set(id, updated);
      return updated;
    },
    async deleteEvent(id) {
      return events.delete(id);
    },
  };
}

describe("parseScopesParam", () => {
  it("defaults to personal and company", () => {
    assert.deepEqual(parseScopesParam(null), ["personal", "company"]);
  });

  it("parses comma-separated scopes", () => {
    assert.deepEqual(parseScopesParam("company"), ["company"]);
  });
});

describe("handleListCalendarEvents", () => {
  it("requires from and to", async () => {
    const result = await handleListCalendarEvents(
      managerA,
      null,
      "2026-06-30T00:00:00.000Z",
      null,
      createMemoryStore(),
    );
    assert.equal("status" in result && result.status, 422);
  });

  it("returns only personal events for requesting user", async () => {
    const deps = createMemoryStore([
      event({ id: "p1", ownerUserId: managerA.id }),
      event({
        id: "p2",
        ownerUserId: managerB.id,
        createdByUserId: managerB.id,
      }),
      event({
        id: "c1",
        scope: "company",
        ownerUserId: null,
        createdByUserId: owner.id,
        createdByName: owner.name,
      }),
    ]);

    const result = await handleListCalendarEvents(
      managerA,
      "2026-06-01T00:00:00.000Z",
      "2026-06-30T00:00:00.000Z",
      null,
      deps,
    );

    assert.ok(!("status" in result));
    if ("status" in result) return;
    assert.equal(result.events.length, 2);
    assert.ok(result.events.some((item) => item.id === "p1"));
    assert.ok(result.events.some((item) => item.id === "c1"));
    assert.ok(!result.events.some((item) => item.id === "p2"));
  });
});

describe("handleCreateCalendarEvent", () => {
  it("forces ownerUserId from session for personal events", async () => {
    const deps = createMemoryStore();
    const result = await handleCreateCalendarEvent(
      managerA,
      {
        scope: "personal",
        title: "Consultation",
        startAt: "2026-06-20T08:00:00.000Z",
        endAt: "2026-06-20T09:00:00.000Z",
        ownerUserId: "hacker",
      },
      deps,
    );

    assert.ok(!("status" in result));
    if ("status" in result) return;
    assert.equal(result.event.ownerUserId, managerA.id);
    assert.equal(result.event.createdByUserId, managerA.id);
  });

  it("rejects invalid body with 422", async () => {
    const result = await handleCreateCalendarEvent(
      managerA,
      { scope: "personal", title: "   " },
      createMemoryStore(),
    );
    assert.equal("status" in result && result.status, 422);
  });

  it("accepts sendReminders on create", async () => {
    const deps = createMemoryStore();
    const result = await handleCreateCalendarEvent(
      managerA,
      {
        scope: "personal",
        title: "Quiet event",
        startAt: "2026-06-20T08:00:00.000Z",
        endAt: "2026-06-20T09:00:00.000Z",
        sendReminders: false,
      },
      deps,
    );

    assert.ok(!("status" in result));
    if ("status" in result) return;
    assert.equal(result.event.sendReminders, false);
  });

  it("defaults sendReminders to true when omitted", async () => {
    const deps = createMemoryStore();
    const result = await handleCreateCalendarEvent(
      managerA,
      {
        scope: "personal",
        title: "Default reminders",
        startAt: "2026-06-20T08:00:00.000Z",
        endAt: "2026-06-20T09:00:00.000Z",
      },
      deps,
    );

    assert.ok(!("status" in result));
    if ("status" in result) return;
    assert.equal(result.event.sendReminders, true);
  });
});

describe("handleGetCalendarEvent", () => {
  it("returns 404 for another user's personal event", async () => {
    const deps = createMemoryStore([
      event({ id: "secret", ownerUserId: managerA.id }),
    ]);
    const result = await handleGetCalendarEvent(managerB, "secret", deps);
    assert.equal("status" in result && result.status, 404);
  });

  it("allows viewing company events", async () => {
    const deps = createMemoryStore([
      event({
        id: "company-1",
        scope: "company",
        ownerUserId: null,
        createdByUserId: owner.id,
        createdByName: owner.name,
      }),
    ]);
    const result = await handleGetCalendarEvent(managerB, "company-1", deps);
    assert.ok(!("status" in result));
  });
});

describe("handleUpdateCalendarEvent", () => {
  it("returns 403 when manager edits another manager's company event", async () => {
    const deps = createMemoryStore([
      event({
        id: "company-1",
        scope: "company",
        ownerUserId: null,
        createdByUserId: managerA.id,
      }),
    ]);

    const result = await handleUpdateCalendarEvent(
      managerB,
      "company-1",
      { title: "Changed" },
      deps,
    );
    assert.equal("status" in result && result.status, 403);
  });

  it("allows owner to edit another manager's company event", async () => {
    const deps = createMemoryStore([
      event({
        id: "company-1",
        scope: "company",
        ownerUserId: null,
        createdByUserId: managerA.id,
      }),
    ]);

    const result = await handleUpdateCalendarEvent(
      owner,
      "company-1",
      { title: "Changed" },
      deps,
    );
    assert.ok(!("status" in result));
    if ("status" in result) return;
    assert.equal(result.event.title, "Changed");
  });

  it("rejects forbidden fields with 422", async () => {
    const deps = createMemoryStore([event({ id: "p1" })]);
    const result = await handleUpdateCalendarEvent(
      managerA,
      "p1",
      { scope: "company" },
      deps,
    );
    assert.equal("status" in result && result.status, 422);
  });

  it("accepts sendReminders on update", async () => {
    const deps = createMemoryStore([event({ id: "p1", sendReminders: true })]);
    const result = await handleUpdateCalendarEvent(
      managerA,
      "p1",
      { sendReminders: false },
      deps,
    );

    assert.ok(!("status" in result));
    if ("status" in result) return;
    assert.equal(result.event.sendReminders, false);
  });

  it("rejects non-boolean sendReminders", async () => {
    const deps = createMemoryStore([event({ id: "p1" })]);
    const result = await handleUpdateCalendarEvent(
      managerA,
      "p1",
      { sendReminders: "yes" },
      deps,
    );
    assert.equal("status" in result && result.status, 422);
  });
});

describe("handleDeleteCalendarEvent", () => {
  it("deletes own personal event", async () => {
    const deps = createMemoryStore([event({ id: "p1" })]);
    const result = await handleDeleteCalendarEvent(managerA, "p1", deps);
    assert.ok(!("status" in result));
    const missing = await handleGetCalendarEvent(managerA, "p1", deps);
    assert.equal("status" in missing && missing.status, 404);
  });
});
