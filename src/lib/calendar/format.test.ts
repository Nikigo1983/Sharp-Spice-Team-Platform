import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "./types";
import {
  eventOccursOnDate,
  eventsForDay,
  formatEventTimeRange,
  formatScopeLabel,
  partitionDayAgenda,
  sortEventsByStartAt,
} from "./format";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    companyId: "sharp-spice",
    scope: "personal",
    ownerUserId: "manager-1",
    title: "Meeting",
    description: "",
    eventType: "general",
    startAt: "2026-06-20T08:00:00.000Z",
    endAt: "2026-06-20T09:00:00.000Z",
    allDay: false,
    location: "",
    sendReminders: true,
    createdByUserId: "manager-1",
    createdByName: "Злата",
    updatedByUserId: null,
    createdAt: "2026-06-19T12:00:00.000Z",
    updatedAt: "2026-06-19T12:00:00.000Z",
    ...overrides,
  };
}

describe("formatScopeLabel", () => {
  it("maps scopes to Russian labels", () => {
    assert.equal(formatScopeLabel("personal"), "Личное");
    assert.equal(formatScopeLabel("company"), "Компания");
  });
});

describe("formatEventTimeRange", () => {
  it("returns all-day label", () => {
    assert.equal(
      formatEventTimeRange(event({ allDay: true })),
      "Весь день",
    );
  });

  it("returns start and end times", () => {
    const range = formatEventTimeRange(event());
    assert.match(range, /–/);
  });
});

describe("sortEventsByStartAt", () => {
  it("sorts by startAt ascending", () => {
    const sorted = sortEventsByStartAt([
      event({ id: "b", startAt: "2026-06-20T12:00:00.000Z" }),
      event({ id: "a", startAt: "2026-06-20T08:00:00.000Z" }),
    ]);
    assert.deepEqual(sorted.map((item) => item.id), ["a", "b"]);
  });
});

describe("partitionDayAgenda", () => {
  it("puts all-day events first in their group", () => {
    const { allDay, timed } = partitionDayAgenda([
      event({ id: "timed", allDay: false }),
      event({ id: "allday", allDay: true }),
    ]);
    assert.deepEqual(allDay.map((item) => item.id), ["allday"]);
    assert.deepEqual(timed.map((item) => item.id), ["timed"]);
  });
});

describe("eventsForDay", () => {
  it("includes events overlapping the day", () => {
    const items = eventsForDay(
      [
        event({ id: "today", startAt: "2026-06-20T08:00:00.000Z" }),
        event({
          id: "other",
          startAt: "2026-06-21T08:00:00.000Z",
          endAt: "2026-06-21T09:00:00.000Z",
        }),
      ],
      "2026-06-20",
    );
    assert.deepEqual(items.map((item) => item.id), ["today"]);
  });

  it("detects occurrence by date key", () => {
    assert.equal(
      eventOccursOnDate(
        event({ startAt: "2026-06-20T08:00:00.000Z", endAt: "2026-06-20T09:00:00.000Z" }),
        "2026-06-20",
      ),
      true,
    );
  });
});
