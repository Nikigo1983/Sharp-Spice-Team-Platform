import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeCalendarReminderMessage } from "./calendar-reminder-copy";
import { encodeClientNewMessage } from "./client-new-copy";
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

  it("routes task approval and revision types to tasks", () => {
    assert.equal(getNotificationSection("task_pending_approval"), "tasks");
    assert.equal(getNotificationSection("task_revision"), "tasks");
    assert.equal(getNotificationHref("task_pending_approval"), "/tasks");
    assert.equal(getNotificationHref("task_revision"), "/tasks");
    assert.equal(shouldShowNotificationToast("task_pending_approval"), true);
    assert.equal(shouldShowNotificationToast("task_revision"), true);
    assert.equal(shouldShowNotificationToast("system"), true);
  });

  it("routes meeting recordings", () => {
    assert.equal(
      getNotificationSection("meeting_recording_ready"),
      "meeting-recordings",
    );
    assert.equal(
      getNotificationHref("meeting_recording_ready"),
      "/meeting-recordings",
    );
    assert.equal(
      shouldShowNotificationToast("meeting_recording_ready"),
      true,
    );
  });

  it("routes portal new clients to intake", () => {
    assert.equal(getNotificationSection("client_new"), "intake");
    assert.equal(getNotificationHref("client_new"), "/clients/intake");
    assert.equal(
      pathnameMatchesNotificationSection("/clients/intake", "intake"),
      true,
    );
    assert.equal(getNotificationSection("consultation_assigned"), "formgrid");
    assert.equal(
      getNotificationHref("consultation_assigned"),
      "/new-formgrid-clients",
    );
  });

  it("deep-links portal new clients and routes Formgrid elsewhere", () => {
    const intakeMsg = encodeClientNewMessage("Иванов (Портал Emigrant)", {
      destination: "intake",
      caseId: "case-42",
    });
    assert.equal(
      getNotificationHref("client_new", intakeMsg),
      "/clients/intake?id=case-42",
    );
    assert.equal(
      getNotificationDisplayMessage("client_new", intakeMsg),
      "Иванов (Портал Emigrant)",
    );
    assert.equal(getNotificationSection("client_new", intakeMsg), "intake");

    const formgridMsg = encodeClientNewMessage("Петров (анкета Formgrid)", {
      destination: "formgrid",
    });
    assert.equal(
      getNotificationHref("client_new", formgridMsg),
      "/new-formgrid-clients",
    );
    assert.equal(getNotificationSection("client_new", formgridMsg), "formgrid");
  });
});
