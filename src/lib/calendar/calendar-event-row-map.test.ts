import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "./types";
import {
  mapCalendarEventRowToEvent,
  mapCalendarEventToRow,
} from "./calendar-event-row-map";

const sampleEvent: CalendarEvent = {
  id: "evt-1",
  companyId: "sharp-spice",
  scope: "company",
  ownerUserId: null,
  title: "Team sync",
  description: "",
  eventType: "general",
  startAt: "2026-06-25T08:00:00.000Z",
  endAt: "2026-06-25T09:00:00.000Z",
  allDay: false,
  location: "",
  sendReminders: false,
  createdByUserId: "veronika",
  createdByName: "Вероника",
  updatedByUserId: null,
  createdAt: "2026-06-20T10:00:00.000Z",
  updatedAt: "2026-06-20T10:00:00.000Z",
};

describe("mapCalendarEventToRow / mapCalendarEventRowToEvent", () => {
  it("round-trips send_reminders", () => {
    const row = mapCalendarEventToRow(sampleEvent);
    assert.equal(row.send_reminders, false);

    const restored = mapCalendarEventRowToEvent(row);
    assert.equal(restored.sendReminders, false);
    assert.equal(restored.title, sampleEvent.title);
  });

  it("defaults send_reminders true in row mapping", () => {
    const row = mapCalendarEventToRow({
      ...sampleEvent,
      sendReminders: true,
    });
    assert.equal(row.send_reminders, true);
  });

  it("round-trips video_meeting event_type", () => {
    const row = mapCalendarEventToRow({
      ...sampleEvent,
      eventType: "video_meeting",
    });
    assert.equal(row.event_type, "video_meeting");

    const restored = mapCalendarEventRowToEvent(row);
    assert.equal(restored.eventType, "video_meeting");
  });
});
