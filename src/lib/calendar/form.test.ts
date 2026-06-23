import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "./types";
import {
  defaultFormValues,
  eventToFormValues,
  formValuesToCreatePayload,
  formValuesToUpdatePayload,
  validateFormValues,
} from "./form";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    companyId: "sharp-spice",
    scope: "personal",
    ownerUserId: "manager-1",
    title: "Meeting",
    description: "Notes",
    eventType: "general",
    startAt: "2026-06-20T08:00:00.000Z",
    endAt: "2026-06-20T09:00:00.000Z",
    allDay: false,
    location: "Office",
    sendReminders: true,
    createdByUserId: "manager-1",
    createdByName: "Злата",
    updatedByUserId: null,
    createdAt: "2026-06-19T12:00:00.000Z",
    updatedAt: "2026-06-19T12:00:00.000Z",
    ...overrides,
  };
}

describe("defaultFormValues", () => {
  it("prefills anchor date and default times", () => {
    const values = defaultFormValues(new Date("2026-06-20T12:00:00.000Z"));
    assert.equal(values.scope, "personal");
    assert.equal(values.eventType, "general");
    assert.equal(values.startDate, "2026-06-20");
    assert.equal(values.endDate, "2026-06-20");
    assert.equal(values.startTime, "10:00");
    assert.equal(values.endTime, "11:00");
    assert.equal(values.sendReminders, true);
  });
});

describe("eventToFormValues", () => {
  it("maps stored event back to form fields", () => {
    const values = eventToFormValues(
      event({
        startAt: "2026-06-20T08:00:00.000Z",
        endAt: "2026-06-20T09:00:00.000Z",
      }),
    );

    assert.equal(values.allDay, false);
    assert.equal(values.title, "Meeting");
    assert.equal(values.startDate, "2026-06-20");
    assert.equal(values.endDate, "2026-06-20");
    assert.equal(values.sendReminders, true);
  });

  it("maps sendReminders when reminders are disabled", () => {
    const values = eventToFormValues(event({ sendReminders: false }));
    assert.equal(values.sendReminders, false);
  });
});

describe("validateFormValues", () => {
  it("rejects empty title", () => {
    const values = defaultFormValues(new Date("2026-06-20T12:00:00.000Z"));
    values.title = "   ";
    assert.equal(validateFormValues(values), "Укажите название события");
  });

  it("rejects end before start", () => {
    const values = defaultFormValues(new Date("2026-06-20T12:00:00.000Z"));
    values.title = "Консультация";
    values.startTime = "12:00";
    values.endTime = "10:00";
    assert.equal(
      validateFormValues(values),
      "Окончание не может быть раньше начала",
    );
  });
});

describe("formValuesToCreatePayload", () => {
  it("builds API payload with ISO timestamps", () => {
    const values = defaultFormValues(new Date("2026-06-20T12:00:00.000Z"));
    values.title = "Консультация";
    values.scope = "company";

    const payload = formValuesToCreatePayload(values);
    assert.equal(payload.title, "Консультация");
    assert.equal(payload.scope, "company");
    assert.ok(payload.startAt.includes("T"));
    assert.ok(payload.endAt >= payload.startAt);
  });

  it("uses full-day bounds for all-day events", () => {
    const values = defaultFormValues(new Date("2026-06-20T12:00:00.000Z"));
    values.title = "Подача";
    values.allDay = true;

    const payload = formValuesToCreatePayload(values);
    assert.equal(payload.allDay, true);
    assert.ok(payload.endAt > payload.startAt);
  });

  it("includes sendReminders in create payload", () => {
    const values = defaultFormValues(new Date("2026-06-20T12:00:00.000Z"));
    values.title = "Quiet day";
    values.sendReminders = false;

    const payload = formValuesToCreatePayload(values);
    assert.equal(payload.sendReminders, false);
  });

  it("includes eventType in create payload", () => {
    const values = defaultFormValues(new Date("2026-06-20T12:00:00.000Z"));
    values.title = "Синк";
    values.eventType = "video_meeting";

    const payload = formValuesToCreatePayload(values);
    assert.equal(payload.eventType, "video_meeting");
  });

  it("maps eventType from stored event", () => {
    const values = eventToFormValues(event({ eventType: "video_meeting" }));
    assert.equal(values.eventType, "video_meeting");
  });

  it("rejects video meeting with all-day flag", () => {
    const values = defaultFormValues(new Date("2026-06-20T12:00:00.000Z"));
    values.title = "Синк";
    values.eventType = "video_meeting";
    values.allDay = true;
    assert.equal(
      validateFormValues(values),
      "Видеовстреча не может быть событием на весь день",
    );
  });
});

describe("formValuesToUpdatePayload", () => {
  it("includes sendReminders in update payload", () => {
    const values = eventToFormValues(event({ sendReminders: false }));
    const payload = formValuesToUpdatePayload(values);
    assert.equal(payload.sendReminders, false);
  });
});
