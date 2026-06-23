import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "@/lib/calendar/types";
import {
  buildCalendarReminderNotificationContent,
  decodeCalendarReminderMessage,
  formatCalendarReminderDisplayMessage,
  getCalendarReminderTitle,
} from "./calendar-reminder-copy";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-42",
    companyId: "sharp-spice",
    scope: "personal",
    ownerUserId: "veronika",
    title: "Созвон с клиентом",
    description: "",
    eventType: "general",
    startAt: "2026-06-25T08:00:00.000Z",
    endAt: "2026-06-25T09:00:00.000Z",
    allDay: false,
    location: "",
    sendReminders: true,
    createdByUserId: "veronika",
    createdByName: "Вероника",
    updatedByUserId: null,
    createdAt: "2026-06-20T10:00:00.000Z",
    updatedAt: "2026-06-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("calendar reminder notification copy", () => {
  it("builds titles for fixed offsets", () => {
    assert.equal(getCalendarReminderTitle(1440), "Напоминание: завтра");
    assert.equal(getCalendarReminderTitle(60), "Напоминание: через 1 час");
  });

  it("formats timed and all-day messages", () => {
    const timed = formatCalendarReminderDisplayMessage(event());
    assert.match(timed, /^\d{2}:\d{2} – \d{2}:\d{2} — Созвон с клиентом$/);

    const allDay = formatCalendarReminderDisplayMessage(
      event({ allDay: true, title: "Выходной" }),
    );
    assert.equal(allDay, "Весь день — Выходной");
  });

  it("encodes event id for navigation without changing display text", () => {
    const { title, message } = buildCalendarReminderNotificationContent(
      event(),
      60,
    );

    assert.equal(title, "Напоминание: через 1 час");
    const decoded = decodeCalendarReminderMessage(message);
    assert.equal(decoded.eventId, "evt-42");
    assert.match(decoded.display, /Созвон с клиентом$/);
  });
});
