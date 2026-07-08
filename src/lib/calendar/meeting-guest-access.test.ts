import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "./types";
import {
  eventRequiresGuestPassword,
  hashGuestAccessPassword,
  isGuestLimitReached,
  normalizeGuestAccessPasswordInput,
  sanitizeCalendarEventForClient,
  verifyGuestAccessPassword,
} from "./meeting-guest-access";

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
  guestMaxCount: 2,
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

describe("meeting guest access helpers", () => {
  it("detects when a password is required", () => {
    assert.equal(eventRequiresGuestPassword(event), false);
    assert.equal(
      eventRequiresGuestPassword({
        ...event,
        guestAccessPasswordHash: "hash",
      }),
      true,
    );
  });

  it("enforces guest limits", () => {
    assert.equal(isGuestLimitReached(1, event), false);
    assert.equal(isGuestLimitReached(2, event), true);
    assert.equal(isGuestLimitReached(99, { ...event, guestMaxCount: null }), false);
  });

  it("normalizes password input", () => {
    assert.equal(normalizeGuestAccessPasswordInput(undefined), undefined);
    assert.equal(normalizeGuestAccessPasswordInput(null), null);
    assert.equal(normalizeGuestAccessPasswordInput("  secret "), "secret");
    assert.equal(normalizeGuestAccessPasswordInput("   "), null);
  });

  it("sanitizes password hash for client responses", () => {
    const sanitized = sanitizeCalendarEventForClient({
      ...event,
      guestAccessPasswordHash: "hash-value",
      guestAccessPasswordSet: true,
    });

    assert.equal(sanitized.guestAccessPasswordHash, null);
    assert.equal(sanitized.guestAccessPasswordSet, true);
  });

  it("verifies guest passwords", async () => {
    const hash = await hashGuestAccessPassword("secret");
    assert.equal(await verifyGuestAccessPassword("secret", hash), true);
    assert.equal(await verifyGuestAccessPassword("wrong", hash), false);
    assert.equal(await verifyGuestAccessPassword("secret", null), true);
    assert.equal(await verifyGuestAccessPassword("", hash), false);
  });
});
