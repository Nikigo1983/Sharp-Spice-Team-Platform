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
  videoInviteMode: null,
  guestWaitingRoom: true,
  guestMaxCount: 10,
  guestAccessPasswordHash: null,
  guestAccessPasswordSet: false,
  linkedClientId: null,
  linkedClientName: null,
  participantUserIds: [],
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
      videoInviteMode: "selected",
    });
    assert.equal(row.event_type, "video_meeting");
    assert.equal(row.video_invite_mode, "selected");

    const restored = mapCalendarEventRowToEvent(row, ["manager-1"]);
    assert.equal(restored.eventType, "video_meeting");
    assert.deepEqual(restored.participantUserIds, ["manager-1"]);
  });

  it("round-trips guest access fields for video meetings", () => {
    const row = mapCalendarEventToRow({
      ...sampleEvent,
      eventType: "video_meeting",
      videoInviteMode: "all_team",
      guestMaxCount: 5,
      guestAccessPasswordHash: "hash-value",
      guestAccessPasswordSet: true,
    });
    assert.equal(row.guest_max_count, 5);
    assert.equal(row.guest_access_password_hash, "hash-value");

    const restored = mapCalendarEventRowToEvent(row);
    assert.equal(restored.guestMaxCount, 5);
    assert.equal(restored.guestAccessPasswordHash, "hash-value");
    assert.equal(restored.guestAccessPasswordSet, true);
  });

  it("round-trips linked client fields for video meetings", () => {
    const row = mapCalendarEventToRow({
      ...sampleEvent,
      eventType: "video_meeting",
      videoInviteMode: "all_team",
      linkedClientId: "CL-1001",
      linkedClientName: "Anna Client",
    });
    assert.equal(row.linked_client_id, "CL-1001");
    assert.equal(row.linked_client_name, "Anna Client");

    const restored = mapCalendarEventRowToEvent(row);
    assert.equal(restored.linkedClientId, "CL-1001");
    assert.equal(restored.linkedClientName, "Anna Client");
  });
});
