import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeCalendarReminderMessage } from "./calendar-reminder-copy";
import {
  getNotificationActionLabel,
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
    assert.equal(getNotificationActionLabel("calendar_reminder", message), null);
  });

  it("routes video meeting reminders to meet page", () => {
    const message = encodeCalendarReminderMessage(
      "10:00 – 11:00 — Синк",
      "evt-video",
      { isVideoMeeting: true },
    );

    assert.equal(
      getNotificationHref("calendar_reminder", message),
      "/calendar/meet/evt-video",
    );
    assert.equal(
      getNotificationActionLabel("calendar_reminder", message),
      "Присоединиться",
    );
  });

  it("routes video meeting invites to meet page with toast", () => {
    const message = encodeCalendarReminderMessage(
      "10:00 – 11:00 — Синк",
      "evt-invite",
      { isVideoMeeting: true },
    );

    assert.equal(
      getNotificationHref("calendar_video_invite", message),
      "/calendar/meet/evt-invite",
    );
    assert.equal(getNotificationSection("calendar_video_invite"), "calendar");
    assert.equal(shouldShowNotificationToast("calendar_video_invite"), true);
    assert.equal(
      getNotificationDisplayMessage("calendar_video_invite", message),
      "10:00 – 11:00 — Синк",
    );
    assert.equal(
      getNotificationActionLabel("calendar_video_invite", message),
      "Присоединиться",
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
      pathnameMatchesNotificationSection("/calendar/meet/evt-1", "calendar"),
      true,
    );
    assert.equal(
      pathnameMatchesNotificationSection("/calendar?event=1", "calendar"),
      false,
    );
  });
});
