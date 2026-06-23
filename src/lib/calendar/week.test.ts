import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "./types";
import {
  buildWeekColumns,
  getAllDayEventsForWeekDay,
  getEventDayTimeRange,
  layoutWeekTimedEvents,
  weekGridHasAllDayEvents,
  WEEK_GRID_END_HOUR,
  WEEK_GRID_START_HOUR,
} from "./week";

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

describe("buildWeekColumns", () => {
  it("returns seven columns from Monday to Sunday", () => {
    const columns = buildWeekColumns(new Date("2026-06-20T12:00:00.000Z"));
    assert.equal(columns.length, 7);
    assert.equal(columns[0]?.weekdayLabel, "Пн");
    assert.equal(columns[6]?.weekdayLabel, "Вс");
    assert.equal(columns[0]?.dateKey, "2026-06-15");
    assert.equal(columns[6]?.dateKey, "2026-06-21");
  });

  it("marks today in the week", () => {
    const columns = buildWeekColumns(
      new Date("2026-06-20T12:00:00.000Z"),
      "2026-06-20",
    );
    const todayColumns = columns.filter((column) => column.isToday);
    assert.equal(todayColumns.length, 1);
    assert.equal(todayColumns[0]?.dateKey, "2026-06-20");
  });
});

describe("layoutWeekTimedEvents", () => {
  it("places timed events inside the visible hour grid", () => {
    const layouts = layoutWeekTimedEvents(
      [
        event({
          startAt: "2026-06-20T07:00:00.000Z",
          endAt: "2026-06-20T08:30:00.000Z",
        }),
      ],
      "2026-06-20",
    );

    assert.equal(layouts.length, 1);
    assert.ok(layouts[0].topRatio >= 0);
    assert.ok(layouts[0].heightRatio > 0);
    assert.ok(layouts[0].topRatio + layouts[0].heightRatio <= 1.01);
  });

  it("stacks overlapping events vertically", () => {
    const layouts = layoutWeekTimedEvents(
      [
        event({
          id: "evt-a",
          title: "A",
          startAt: "2026-06-20T08:00:00.000Z",
          endAt: "2026-06-20T09:00:00.000Z",
        }),
        event({
          id: "evt-b",
          title: "B",
          startAt: "2026-06-20T08:15:00.000Z",
          endAt: "2026-06-20T09:15:00.000Z",
        }),
      ],
      "2026-06-20",
    );

    assert.equal(layouts.length, 2);
    assert.equal(layouts[0]?.stackCount, 2);
    assert.equal(layouts[1]?.stackCount, 2);
    assert.notEqual(layouts[0]?.topRatio, layouts[1]?.topRatio);
  });

  it("ignores events outside the week grid hours", () => {
    const range = getEventDayTimeRange(
      event({
        startAt: "2026-06-20T03:00:00.000Z",
        endAt: "2026-06-20T04:00:00.000Z",
      }),
      "2026-06-20",
    );
    assert.ok(range);

    const layouts = layoutWeekTimedEvents(
      [
        event({
          startAt: "2026-06-20T03:00:00.000Z",
          endAt: "2026-06-20T04:00:00.000Z",
        }),
      ],
      "2026-06-20",
    );
    assert.equal(layouts.length, 0);
  });
});

describe("all-day week helpers", () => {
  it("collects all-day events per day", () => {
    const allDay = getAllDayEventsForWeekDay(
      [event({ allDay: true, title: "Holiday" })],
      "2026-06-20",
    );
    assert.equal(allDay.length, 1);
    assert.equal(allDay[0]?.title, "Holiday");
  });

  it("detects whether the all-day row is needed", () => {
    const columns = buildWeekColumns(new Date("2026-06-20T12:00:00.000Z"));
    assert.equal(
      weekGridHasAllDayEvents(
        [event({ allDay: true })],
        columns,
      ),
      true,
    );
    assert.equal(weekGridHasAllDayEvents([], columns), false);
  });
});

describe("week grid constants", () => {
  it("uses the MVP hour range", () => {
    assert.equal(WEEK_GRID_START_HOUR, 7);
    assert.equal(WEEK_GRID_END_HOUR, 20);
  });
});
