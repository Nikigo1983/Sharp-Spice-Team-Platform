import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUser } from "@/lib/auth/types";
import type { CalendarEvent, CalendarMeetingRecording } from "./types";
import {
  assertCanManageMeetingRecording,
  canViewMeetingRecording,
} from "./meeting-recording-access";

const manager: SessionUser = {
  id: "manager-1",
  name: "Злата",
  email: "manager1@test.com",
  role: "manager",
};

const event: CalendarEvent = {
  id: "evt-video",
  companyId: "sharp-spice",
  scope: "company",
  ownerUserId: null,
  title: "Consultation",
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
  startAt: "2026-06-25T08:00:00.000Z",
  endAt: "2026-06-25T08:30:00.000Z",
  allDay: false,
  location: "",
  sendReminders: true,
  createdByUserId: "manager-1",
  createdByName: "Злата",
  updatedByUserId: null,
  createdAt: "2026-06-20T10:00:00.000Z",
  updatedAt: "2026-06-20T10:00:00.000Z",
};

const completeRecording: CalendarMeetingRecording = {
  id: "rec-1",
  eventId: event.id,
  egressId: "eg-1",
  status: "complete",
  startedByUserId: manager.id,
  startedByName: manager.name,
  storagePath: "evt-video/rec-1.mp4",
  fileName: "consultation.mp4",
  durationSeconds: 600,
  fileSizeBytes: 1024,
  errorMessage: null,
  startedAt: "2026-06-25T08:05:00.000Z",
  endedAt: "2026-06-25T08:15:00.000Z",
  createdAt: "2026-06-25T08:05:00.000Z",
};

describe("meeting recording access", () => {
  it("allows team members in the meeting window to manage recordings", () => {
    assert.doesNotThrow(() =>
      assertCanManageMeetingRecording(
        manager,
        event,
        new Date("2026-06-25T08:10:00.000Z"),
      ),
    );
  });

  it("allows viewing completed recordings for accessible events", () => {
    assert.equal(
      canViewMeetingRecording(manager, event, completeRecording),
      true,
    );
  });

  it("blocks viewing incomplete recordings", () => {
    assert.equal(
      canViewMeetingRecording(manager, event, {
        ...completeRecording,
        status: "active",
      }),
      false,
    );
  });
});
