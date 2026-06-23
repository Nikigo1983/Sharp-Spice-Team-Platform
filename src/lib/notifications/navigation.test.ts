import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeCalendarReminderMessage } from "./calendar-reminder-copy";
import {
  getNotificationDisplayMessage,
  getNotificationHref,
  getNotificationSection,
  pathnameMatchesNotificationSection,
  shouldShowNotificationToast,
} from "./navigation";

describe("notification navigation", () => {
  it("routes calendar reminders to event deep links", () => {
    const message = encodeCalendarReminderMessage(
      "10:00 – 11:00 — Созвон",
      "evt-99",
    );

    assert.equal(
      getNotificationHref("calendar_reminder", message),
      "/calendar?event=evt-99",
    );
    assert.equal(getNotificationSection("calendar_reminder"), "calendar");
    assert.equal(shouldShowNotificationToast("calendar_reminder"), true);
    assert.equal(
      getNotificationDisplayMessage("calendar_reminder", message),
      "10:00 – 11:00 — Созвон",
    );
  });

  it("falls back to calendar index when event id is missing", () => {
    assert.equal(getNotificationHref("calendar_reminder"), "/calendar");
  });

  it("matches calendar pathname for toast suppression", () => {
    assert.equal(
      pathnameMatchesNotificationSection("/calendar", "calendar"),
      true,
    );
    assert.equal(
      pathnameMatchesNotificationSection("/calendar?event=1", "calendar"),
      false,
    );
  });
});
