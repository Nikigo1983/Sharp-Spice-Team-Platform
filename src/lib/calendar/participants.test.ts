import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "./types";
import {
  canViewVideoMeeting,
  formatParticipantNames,
  getEffectiveVideoInviteMode,
  isUserInvitedToVideoMeeting,
  normalizeParticipantUserIds,
  resolveVideoMeetingReminderRecipientIds,
} from "./participants";

function videoEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-video",
    companyId: "sharp-spice",
    scope: "company",
    ownerUserId: null,
    title: "Sync",
    description: "",
    eventType: "video_meeting",
    videoInviteMode: "selected",
    participantUserIds: ["manager-2"],
    startAt: "2026-06-25T08:00:00.000Z",
    endAt: "2026-06-25T09:00:00.000Z",
    allDay: false,
    location: "",
    sendReminders: true,
    createdByUserId: "manager-1",
    createdByName: "Злата",
    updatedByUserId: null,
    createdAt: "2026-06-20T10:00:00.000Z",
    updatedAt: "2026-06-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("getEffectiveVideoInviteMode", () => {
  it("defaults company video meetings to all_team", () => {
    assert.equal(
      getEffectiveVideoInviteMode(
        videoEvent({ videoInviteMode: null, participantUserIds: [] }),
      ),
      "all_team",
    );
  });

  it("returns null for general events", () => {
    assert.equal(
      getEffectiveVideoInviteMode(
        videoEvent({ eventType: "general", videoInviteMode: null }),
      ),
      null,
    );
  });
});

describe("isUserInvitedToVideoMeeting", () => {
  it("allows selected participants and creator", () => {
    const event = videoEvent();
    assert.equal(isUserInvitedToVideoMeeting("manager-1", event), true);
    assert.equal(isUserInvitedToVideoMeeting("manager-2", event), true);
    assert.equal(isUserInvitedToVideoMeeting("manager-3", event), false);
  });

  it("allows all team for company all_team mode", () => {
    const event = videoEvent({
      videoInviteMode: "all_team",
      participantUserIds: [],
    });
    assert.equal(isUserInvitedToVideoMeeting("manager-3", event), true);
  });
});

describe("canViewVideoMeeting", () => {
  it("hides selected company meetings from non-invited users", () => {
    const event = videoEvent();
    assert.equal(canViewVideoMeeting({ id: "manager-3" }, event), false);
  });
});

describe("normalizeParticipantUserIds", () => {
  it("dedupes and excludes creator", () => {
    assert.deepEqual(
      normalizeParticipantUserIds(
        ["manager-2", "manager-2", "manager-1", "unknown"],
        "manager-1",
      ),
      ["manager-2"],
    );
  });
});

describe("resolveVideoMeetingReminderRecipientIds", () => {
  const active = ["veronika", "manager-1", "manager-2", "manager-3"];

  it("notifies only invited users for selected meetings", () => {
    assert.deepEqual(
      resolveVideoMeetingReminderRecipientIds(videoEvent(), active),
      ["manager-1", "manager-2"],
    );
  });

  it("notifies all active users for all_team meetings", () => {
    assert.deepEqual(
      resolveVideoMeetingReminderRecipientIds(
        videoEvent({ videoInviteMode: "all_team", participantUserIds: [] }),
        active,
      ),
      active,
    );
  });
});

describe("formatParticipantNames", () => {
  it("shows all team label", () => {
    assert.equal(
      formatParticipantNames(
        videoEvent({ videoInviteMode: "all_team", participantUserIds: [] }),
        [
          { id: "manager-1", name: "Злата" },
          { id: "manager-2", name: "Юля" },
        ],
      ),
      "Вся команда",
    );
  });
});
