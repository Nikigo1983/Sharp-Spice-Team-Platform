import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "./types";
import {
  MONTH_MAX_VISIBLE_CHIPS,
  buildMonthMatrix,
  partitionMonthDayEvents,
} from "./month";

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

describe("buildMonthMatrix", () => {
  it("returns weeks starting on Monday", () => {
    const weeks = buildMonthMatrix(new Date("2026-06-15T12:00:00.000Z"));
    assert.ok(weeks.length >= 4 && weeks.length <= 6);
    assert.equal(weeks[0]?.length, 7);
  });

  it("marks days outside current month", () => {
    const weeks = buildMonthMatrix(new Date("2026-06-15T12:00:00.000Z"));
    const cells = weeks.flat();
    assert.ok(cells.some((cell) => cell.inCurrentMonth));
    assert.ok(cells.some((cell) => !cell.inCurrentMonth));
  });

  it("marks today when date matches", () => {
    const weeks = buildMonthMatrix(
      new Date("2026-06-15T12:00:00.000Z"),
      "2026-06-20",
    );
    const todayCells = weeks.flat().filter((cell) => cell.isToday);
    assert.equal(todayCells.length, 1);
    assert.equal(todayCells[0]?.dateKey, "2026-06-20");
  });
});

describe("partitionMonthDayEvents", () => {
  it("limits visible chips and reports overflow", () => {
    const events = Array.from({ length: MONTH_MAX_VISIBLE_CHIPS + 2 }, (_, index) =>
      event({
        id: `evt-${index}`,
        title: `Event ${index}`,
        startAt: `2026-06-20T0${index}:00:00.000Z`,
        endAt: `2026-06-20T0${index}:30:00.000Z`,
      }),
    );

    const result = partitionMonthDayEvents(events, "2026-06-20");
    assert.equal(result.visible.length, MONTH_MAX_VISIBLE_CHIPS);
    assert.equal(result.overflow, 2);
  });

  it("returns zero overflow for empty day", () => {
    const result = partitionMonthDayEvents([], "2026-06-20");
    assert.equal(result.visible.length, 0);
    assert.equal(result.overflow, 0);
  });
});
