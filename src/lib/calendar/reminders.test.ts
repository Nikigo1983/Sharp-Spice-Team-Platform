import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "./types";
import {
  computeEffectiveStartMs,
  computeFireTargetMs,
  getEventScanRangeIso,
  getReminderDeliveryCandidate,
  isFireTargetInWindow,
  listReminderOffsetsForEvent,
  resolveReminderRecipientIds,
} from "./reminders";

const GRACE_MS = 10 * 60 * 1000;
const CRON_MS = 5 * 60 * 1000;

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    companyId: "sharp-spice",
    scope: "personal",
    ownerUserId: "manager-1",
    title: "Meeting",
    description: "",
    eventType: "general",
    startAt: "2026-06-25T08:00:00.000Z",
    endAt: "2026-06-25T09:00:00.000Z",
    allDay: false,
    location: "",
    sendReminders: true,
    createdByUserId: "manager-1",
    createdByName: "Злата",
    updatedByUserId: null,
    createdAt: "2026-06-20T10:00:00.000Z",
    updatedAt: "2026-06-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("computeEffectiveStartMs", () => {
  it("uses startAt for timed events", () => {
    const startAt = "2026-06-25T08:00:00.000Z";
    assert.equal(
      computeEffectiveStartMs(event({ startAt, allDay: false })),
      Date.parse(startAt),
    );
  });

  it("uses local midnight for all-day events", () => {
    const timed = event({
      allDay: true,
      startAt: "2026-06-24T22:00:00.000Z",
      endAt: "2026-06-25T21:59:59.000Z",
    });
    assert.equal(
      computeEffectiveStartMs(timed),
      Date.parse("2026-06-24T22:00:00.000Z"),
    );
  });
});

describe("computeFireTargetMs", () => {
  it("subtracts offset minutes from effective start", () => {
    const effectiveStartMs = Date.parse("2026-06-25T08:00:00.000Z");
    assert.equal(
      computeFireTargetMs(effectiveStartMs, 60),
      effectiveStartMs - 60 * 60_000,
    );
    assert.equal(
      computeFireTargetMs(effectiveStartMs, 1440),
      effectiveStartMs - 1440 * 60_000,
    );
  });
});

describe("isFireTargetInWindow", () => {
  it("accepts fire target inside grace and cron window", () => {
    const nowMs = Date.parse("2026-06-25T07:00:00.000Z");
    const fireTargetMs = nowMs;
    assert.equal(
      isFireTargetInWindow(fireTargetMs, nowMs, {
        graceWindowMs: GRACE_MS,
        cronWindowMs: CRON_MS,
      }),
      true,
    );
  });

  it("rejects fire target older than grace window", () => {
    const nowMs = Date.parse("2026-06-25T07:00:00.000Z");
    const fireTargetMs = nowMs - GRACE_MS - 1;
    assert.equal(
      isFireTargetInWindow(fireTargetMs, nowMs, {
        graceWindowMs: GRACE_MS,
        cronWindowMs: CRON_MS,
      }),
      false,
    );
  });

  it("rejects fire target beyond cron window", () => {
    const nowMs = Date.parse("2026-06-25T07:00:00.000Z");
    const fireTargetMs = nowMs + CRON_MS + 1;
    assert.equal(
      isFireTargetInWindow(fireTargetMs, nowMs, {
        graceWindowMs: GRACE_MS,
        cronWindowMs: CRON_MS,
      }),
      false,
    );
  });
});

describe("getReminderDeliveryCandidate", () => {
  it("skips when sendReminders is false", () => {
    const nowMs = Date.parse("2026-06-24T08:00:00.000Z");
    assert.equal(
      getReminderDeliveryCandidate(
        event({ sendReminders: false }),
        1440,
        nowMs,
        { graceWindowMs: GRACE_MS, cronWindowMs: CRON_MS },
      ),
      "reminders_disabled",
    );
  });

  it("skips 24h offset when event is less than 24h away", () => {
    const startAt = "2026-06-25T08:00:00.000Z";
    const nowMs = Date.parse("2026-06-25T06:00:00.000Z");
    assert.equal(
      getReminderDeliveryCandidate(event({ startAt }), 1440, nowMs, {
        graceWindowMs: GRACE_MS,
        cronWindowMs: CRON_MS,
      }),
      "fire_target_too_late",
    );
  });

  it("accepts 1h offset inside fire window", () => {
    const startAt = "2026-06-25T08:00:00.000Z";
    const nowMs = Date.parse("2026-06-25T07:00:00.000Z");
    const candidate = getReminderDeliveryCandidate(event({ startAt }), 60, nowMs, {
      graceWindowMs: GRACE_MS,
      cronWindowMs: CRON_MS,
    });
    assert.notEqual(typeof candidate, "string");
    if (typeof candidate !== "string") {
      assert.equal(candidate.offsetMinutes, 60);
      assert.equal(candidate.fireTargetMs, Date.parse("2026-06-25T07:00:00.000Z"));
    }
  });
});

describe("resolveReminderRecipientIds", () => {
  const activeUserIds = ["veronika", "manager-1", "manager-2"];

  it("returns only owner for personal events", () => {
    assert.deepEqual(
      resolveReminderRecipientIds(
        event({ scope: "personal", ownerUserId: "manager-1" }),
        activeUserIds,
      ),
      ["manager-1"],
    );
  });

  it("returns all active users for company events", () => {
    assert.deepEqual(
      resolveReminderRecipientIds(
        event({ scope: "company", ownerUserId: null }),
        activeUserIds,
      ),
      activeUserIds,
    );
  });
});

describe("listReminderOffsetsForEvent", () => {
  it("returns only offsets inside the fire window", () => {
    const startAt = "2026-06-25T08:00:00.000Z";
    const nowMs = Date.parse("2026-06-25T07:00:00.000Z");
    const offsets = listReminderOffsetsForEvent(event({ startAt }), nowMs, {
      graceWindowMs: GRACE_MS,
      cronWindowMs: CRON_MS,
    });
    assert.deepEqual(offsets.map((item) => item.offsetMinutes), [60]);
  });
});

describe("getEventScanRangeIso", () => {
  it("covers both reminder offsets", () => {
    const nowMs = Date.parse("2026-06-25T07:00:00.000Z");
    const range = getEventScanRangeIso(nowMs, {
      graceWindowMs: GRACE_MS,
      cronWindowMs: CRON_MS,
    });
    assert.ok(range.from < range.to);
    assert.ok(range.from <= new Date(nowMs - GRACE_MS + 60 * 60_000).toISOString());
    assert.ok(range.to >= new Date(nowMs + CRON_MS + 1440 * 60_000).toISOString());
  });
});
