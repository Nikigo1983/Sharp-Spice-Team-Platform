import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUser } from "@/lib/auth/types";
import type { CalendarEvent } from "./types";
import {
  buildGuestJoinUrl,
  generateGuestInviteToken,
  isGuestParticipantId,
  normalizeGuestDisplayName,
} from "./meeting-guest-invite";
import { handleGetOrCreateGuestInvite } from "./meeting-guest-invite-handler";
import { handleMintGuestMeetingToken, resolveGuestMeetingPreview } from "./meeting-guest-handler";
import { mintGuestMeetingAccessToken } from "./meeting-token";

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
  guestWaitingRoom: false,
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

describe("meeting guest invite helpers", () => {
  it("normalizes guest display names", () => {
    assert.equal(normalizeGuestDisplayName("  Anna   Lee "), "Anna Lee");
    assert.equal(normalizeGuestDisplayName("A"), null);
    assert.equal(normalizeGuestDisplayName(""), null);
  });

  it("detects guest participant ids", () => {
    assert.equal(isGuestParticipantId("guest-abc"), true);
    assert.equal(isGuestParticipantId("manager-1"), false);
  });

  it("builds guest join urls", () => {
    const token = "abc123";
    assert.equal(
      buildGuestJoinUrl(token, "https://example.com"),
      "https://example.com/join/abc123",
    );
  });

  it("generates unique invite tokens", () => {
    assert.notEqual(generateGuestInviteToken(), generateGuestInviteToken());
  });
});

describe("resolveGuestMeetingPreview", () => {
  it("returns preview for a valid invite", async () => {
    const preview = await resolveGuestMeetingPreview(
      "invite-token",
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
      },
      new Date("2026-06-25T08:10:00.000Z"),
    );

    assert.ok(!("error" in preview));
    if (!("error" in preview)) {
      assert.equal(preview.phase, "open");
      assert.equal(preview.event.title, "Consultation");
    }
  });

  it("rejects invalid invites", async () => {
    const preview = await resolveGuestMeetingPreview(
      "missing",
      {
        getInviteByToken: async () => null,
        getEventById: async () => event,
        isConfigured: () => true,
      },
    );

    assert.deepEqual(preview, { error: "invalid_invite" });
  });
});

describe("handleGetOrCreateGuestInvite", () => {
  it("creates an invite when none exists", async () => {
    let insertedToken = "";
    const result = await handleGetOrCreateGuestInvite(
      manager,
      event.id,
      {
        listEventsInRange: async () => [],
        getEvent: async () => event,
        createEvent: async () => event,
        updateEvent: async () => event,
        deleteEvent: async () => true,
      },
      {
        getActiveInvite: async () => null,
        insertInvite: async (input) => {
          insertedToken = input.token;
          return {
            id: "inv-1",
            eventId: input.eventId,
            token: input.token,
            createdByUserId: input.createdByUserId,
            enabled: true,
            createdAt: "2026-06-20T10:00:00.000Z",
            revokedAt: null,
          };
        },
        revokeActiveInvites: async () => {},
        isConfigured: () => true,
      },
    );

    assert.ok(!("error" in result));
    if (!("error" in result)) {
      assert.ok(result.guestJoinUrl.includes(`/join/${encodeURIComponent(insertedToken)}`));
    }
  });
});

describe("handleMintGuestMeetingToken", () => {
  it("mints a guest token during the meeting window", async () => {
    const now = new Date("2026-06-25T08:10:00.000Z");
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "devkey";
    process.env.LIVEKIT_API_SECRET = "devsecret";

    const admissionDeps = {
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
      insertAdmission: async (input: {
        eventId: string;
        inviteId: string;
        guestId: string;
        displayName: string;
        status?: "pending" | "admitted";
      }) => ({
        id: "adm-direct",
        eventId: input.eventId,
        inviteId: input.inviteId,
        guestId: input.guestId,
        displayName: input.displayName,
        status: input.status ?? "admitted",
        createdAt: "2026-06-25T08:05:00.000Z",
        decidedAt: null,
        decidedByUserId: null,
      }),
      getAdmissionById: async () => null,
      listAdmissionsByEvent: async () => [],
      updateAdmissionStatus: async () => null,
    };

    const result = await handleMintGuestMeetingToken(
      "invite-token",
      "Anna Client",
      { admissionDeps },
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
      },
      now,
    );

    assert.ok(!("error" in result));
    if (!("error" in result)) {
      assert.equal(result.eventTitle, "Consultation");
      assert.ok(result.guestId.startsWith("guest-"));
      assert.ok(result.token.length > 20);
    }
  });
});

describe("mintGuestMeetingAccessToken", () => {
  it("uses guest identity and display name", async () => {
    const minted = await mintGuestMeetingAccessToken(
      "guest-test-id",
      "Anna Client",
      event,
      {
        url: "wss://example.livekit.cloud",
        apiKey: "devkey",
        apiSecret: "devsecret",
      },
      new Date("2026-06-25T08:10:00.000Z"),
    );

    assert.equal(minted.roomName, "sharp-spice-cal-evt-video");
    assert.ok(minted.token.length > 20);
  });
});
