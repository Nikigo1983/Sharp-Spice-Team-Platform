import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { SessionUser } from "@/lib/auth/types";
import type { CalendarEvent, CreateCalendarEventInput } from "./types";
import { handleMintMeetingToken } from "./meeting-token-handler";
import type { CalendarStoreDeps } from "./handlers";

const PREV_URL = process.env.LIVEKIT_URL;
const PREV_KEY = process.env.LIVEKIT_API_KEY;
const PREV_SECRET = process.env.LIVEKIT_API_SECRET;

afterEach(() => {
  process.env.LIVEKIT_URL = PREV_URL;
  process.env.LIVEKIT_API_KEY = PREV_KEY;
  process.env.LIVEKIT_API_SECRET = PREV_SECRET;
});

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

describe("handleMintMeetingToken", () => {
  it("returns 404 for unknown event", async () => {
    const result = await handleMintMeetingToken(
      managerA,
      "missing",
      createMemoryStore(),
      new Date("2026-06-25T08:10:00.000Z"),
    );

    assert.equal("status" in result && result.status, 404);
  });

  it("returns 404 for another user's personal event", async () => {
    const deps = createMemoryStore([event()]);
    const result = await handleMintMeetingToken(
      managerB,
      "evt-video",
      deps,
      new Date("2026-06-25T08:10:00.000Z"),
    );

    assert.equal("status" in result && result.status, 404);
  });

  it("returns 403 for general events", async () => {
    const deps = createMemoryStore([
      event({ eventType: "general" }),
    ]);
    const result = await handleMintMeetingToken(
      managerA,
      "evt-video",
      deps,
      new Date("2026-06-25T08:10:00.000Z"),
    );

    assert.equal("status" in result && result.status, 403);
    if (!("status" in result)) return;
    assert.equal(result.error, "Not a video meeting");
  });

  it("returns 403 outside meeting window", async () => {
    const deps = createMemoryStore([event()]);
    const result = await handleMintMeetingToken(
      managerA,
      "evt-video",
      deps,
      new Date("2026-06-25T07:30:00.000Z"),
    );

    assert.equal("status" in result && result.status, 403);
    if (!("status" in result)) return;
    assert.equal(result.error, "Meeting window closed");
  });

  it("returns 503 when LiveKit env is missing", async () => {
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;

    const deps = createMemoryStore([event()]);
    const result = await handleMintMeetingToken(
      managerA,
      "evt-video",
      deps,
      new Date("2026-06-25T08:10:00.000Z"),
    );

    assert.equal("status" in result && result.status, 503);
    if (!("status" in result)) return;
    assert.equal(result.error, "Meetings not configured");
  });

  it("returns token payload when access and env are valid", async () => {
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "devkey";
    process.env.LIVEKIT_API_SECRET = "devsecret";

    const deps = createMemoryStore([event()]);
    const result = await handleMintMeetingToken(
      managerA,
      "evt-video",
      deps,
      new Date("2026-06-25T08:10:00.000Z"),
    );

    assert.ok(!("status" in result));
    if ("status" in result) return;
    assert.equal(result.wsUrl, "wss://example.livekit.cloud");
    assert.equal(result.roomName, "sharp-spice-cal-evt-video");
    assert.ok(result.token.length > 20);
    assert.ok(result.expiresAt.includes("T"));
  });
});
