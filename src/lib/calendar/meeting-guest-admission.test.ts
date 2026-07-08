import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUser } from "@/lib/auth/types";
import type { CalendarEvent } from "./types";
import {
  handleDecideGuestAdmission,
  handleRequestGuestAdmission,
} from "./meeting-guest-admission-handler";

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

describe("meeting guest admissions", () => {
  it("creates a pending admission when waiting room is enabled", async () => {
    const result = await handleRequestGuestAdmission(
      "invite-token",
      "Anna Client",
      undefined,
      {
        getInviteByToken: async () => ({
          id: "inv-1",
          eventId: event.id,
          token: "invite-token",
          createdByUserId: manager.id,
          enabled: true,
          createdAt: "2026-06-20T10:00:00.000Z",
          revokedAt: null,
        }),
        getEventById: async () => event,
        isConfigured: () => true,
        countActiveAdmissions: async () => 0,
        insertAdmission: async (input) => ({
          id: "adm-1",
          eventId: input.eventId,
          inviteId: input.inviteId,
          guestId: input.guestId,
          displayName: input.displayName,
          status: "pending",
          createdAt: "2026-06-25T08:05:00.000Z",
          decidedAt: null,
          decidedByUserId: null,
        }),
        getAdmissionById: async () => null,
        listAdmissionsByEvent: async () => [],
        updateAdmissionStatus: async () => null,
      },
      new Date("2026-06-25T08:10:00.000Z"),
    );

    assert.ok(!("error" in result));
    if (!("error" in result)) {
      assert.equal(result.status, "pending");
      assert.equal(result.waitingRoom, true);
    }
  });

  it("lets a host admit a pending guest", async () => {
    const admission = {
      id: "adm-1",
      eventId: event.id,
      inviteId: "inv-1",
      guestId: "guest-abc",
      displayName: "Anna Client",
      status: "pending" as const,
      createdAt: "2026-06-25T08:05:00.000Z",
      decidedAt: null,
      decidedByUserId: null,
    };

    const result = await handleDecideGuestAdmission(
      manager,
      event.id,
      admission.id,
      "admit",
      {
        listEventsInRange: async () => [],
        getEvent: async () => event,
        createEvent: async () => event,
        updateEvent: async () => event,
        deleteEvent: async () => true,
      },
      {
        getInviteByToken: async () => null,
        getEventById: async () => event,
        isConfigured: () => true,
        countActiveAdmissions: async () => 0,
        insertAdmission: async () => admission,
        getAdmissionById: async () => admission,
        listAdmissionsByEvent: async () => [admission],
        updateAdmissionStatus: async (input) => ({
          ...admission,
          status: input.status,
          decidedAt: "2026-06-25T08:11:00.000Z",
          decidedByUserId: input.decidedByUserId ?? null,
        }),
      },
    );

    assert.ok(!("error" in result));
    if (!("error" in result)) {
      assert.equal(result.admission.status, "admitted");
    }
  });
});
