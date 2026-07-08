import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "./types";
import { buildGuestMeetingInviteText } from "./meeting-guest-invite-message";

const event: CalendarEvent = {
  id: "evt-video",
  companyId: "sharp-spice",
  scope: "company",
  ownerUserId: null,
  title: "Консультация по релокации",
  description: "",
  eventType: "video_meeting",
  videoInviteMode: "all_team",
  guestWaitingRoom: true,
  guestMaxCount: 10,
  guestAccessPasswordHash: null,
  guestAccessPasswordSet: false,
  linkedClientId: null,
  linkedClientName: null,
  participantUserIds: [],
  startAt: "2026-07-08T13:00:00.000Z",
  endAt: "2026-07-08T14:00:00.000Z",
  allDay: false,
  location: "",
  sendReminders: true,
  createdByUserId: "manager-1",
  createdByName: "Злата",
  updatedByUserId: null,
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-01T10:00:00.000Z",
};

describe("buildGuestMeetingInviteText", () => {
  it("builds a full invite with greeting, schedule and link", () => {
    const text = buildGuestMeetingInviteText(
      event,
      "https://example.com/join/abc123",
      { recipientName: "Анна", timeZone: "Europe/Moscow" },
    );

    assert.match(text, /Добрый день, Анна!/);
    assert.match(text, /Консультация по релокации/);
    assert.match(text, /Когда:/);
    assert.match(text, /https:\/\/example\.com\/join\/abc123/);
    assert.match(text, /Команда Sharp & Spice/);
  });
});
