import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "@/lib/calendar/types";
import {
  buildCalendarReminderNotificationContent,
  buildVideoMeetingInviteNotificationContent,
  decodeCalendarReminderMessage,
  encodeCalendarReminderMessage,
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
    assert.equal(decoded.isVideoMeeting, false);
    assert.match(decoded.display, /Созвон с клиентом$/);
  });

  it("encodes video meeting flag for video events", () => {
    const { message } = buildCalendarReminderNotificationContent(
      event({ eventType: "video_meeting", title: "Синк команды" }),
      60,
    );

    const decoded = decodeCalendarReminderMessage(message);
    assert.equal(decoded.eventId, "evt-42");
    assert.equal(decoded.isVideoMeeting, true);
    assert.match(decoded.display, /Синк команды$/);
  });

  it("decodes legacy two-part messages without video flag", () => {
    const legacy = "10:00 – 11:00 — Старый формат\u2063evt-old";
    const decoded = decodeCalendarReminderMessage(legacy);
    assert.equal(decoded.eventId, "evt-old");
    assert.equal(decoded.isVideoMeeting, false);
    assert.equal(decoded.display, "10:00 – 11:00 — Старый формат");
  });

  it("round-trips explicit video flag encoding", () => {
    const message = encodeCalendarReminderMessage(
      "10:00 – 11:00 — Синк",
      "evt-video",
      { isVideoMeeting: true },
    );
    const decoded = decodeCalendarReminderMessage(message);
    assert.equal(decoded.eventId, "evt-video");
    assert.equal(decoded.isVideoMeeting, true);
  });

  it("builds instant video meeting invite copy", () => {
    const { title, message } = buildVideoMeetingInviteNotificationContent(
      event({ eventType: "video_meeting", title: "Синк команды" }),
    );

    assert.equal(title, "Приглашение на видеовстречу");
    const decoded = decodeCalendarReminderMessage(message);
    assert.equal(decoded.eventId, "evt-42");
    assert.equal(decoded.isVideoMeeting, true);
    assert.match(decoded.display, /Синк команды$/);
  });
});
