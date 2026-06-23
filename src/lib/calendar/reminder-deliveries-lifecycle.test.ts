import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "./types";
import { shouldResetReminderDeliveriesOnUpdate } from "./reminder-deliveries-lifecycle";

function existingEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
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

describe("shouldResetReminderDeliveriesOnUpdate", () => {
  it("resets when startAt changes", () => {
    assert.equal(
      shouldResetReminderDeliveriesOnUpdate(existingEvent(), {
        startAt: "2026-06-21T08:00:00.000Z",
      }),
      true,
    );
  });

  it("resets when allDay changes", () => {
    assert.equal(
      shouldResetReminderDeliveriesOnUpdate(existingEvent(), { allDay: true }),
      true,
    );
  });

  it("resets when sendReminders turns on", () => {
    assert.equal(
      shouldResetReminderDeliveriesOnUpdate(
        existingEvent({ sendReminders: false }),
        { sendReminders: true },
      ),
      true,
    );
  });

  it("does not reset when sendReminders turns off", () => {
    assert.equal(
      shouldResetReminderDeliveriesOnUpdate(existingEvent(), {
        sendReminders: false,
      }),
      false,
    );
  });

  it("does not reset for title-only edits", () => {
    assert.equal(
      shouldResetReminderDeliveriesOnUpdate(existingEvent(), {
        title: "Updated title",
      }),
      false,
    );
  });
});
