import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import type { SessionUser } from "@/lib/auth/types";
import type { CalendarEvent } from "./types";
import {
  buildMeetingTokenTtlSeconds,
  getLiveKitEnv,
  mintMeetingAccessToken,
} from "./meeting-token";

const PREV_URL = process.env.LIVEKIT_URL;
const PREV_KEY = process.env.LIVEKIT_API_KEY;
const PREV_SECRET = process.env.LIVEKIT_API_SECRET;

afterEach(() => {
  process.env.LIVEKIT_URL = PREV_URL;
  process.env.LIVEKIT_API_KEY = PREV_KEY;
  process.env.LIVEKIT_API_SECRET = PREV_SECRET;
});

const user: SessionUser = {
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
  title: "Sync",
  description: "",
  eventType: "video_meeting",
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

describe("getLiveKitEnv", () => {
  beforeEach(() => {
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
  });

  it("returns null when any LiveKit env var is missing", () => {
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "key";
    assert.equal(getLiveKitEnv(), null);
  });

  it("returns config when all LiveKit env vars are set", () => {
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "key";
    process.env.LIVEKIT_API_SECRET = "secret";

    assert.deepEqual(getLiveKitEnv(), {
      url: "wss://example.livekit.cloud",
      apiKey: "key",
      apiSecret: "secret",
    });
  });
});

describe("buildMeetingTokenTtlSeconds", () => {
  it("caps ttl at one hour", () => {
    const ttl = buildMeetingTokenTtlSeconds(
      event,
      new Date("2026-06-25T07:45:00.000Z"),
    );
    assert.equal(ttl, 3600);
  });

  it("uses remaining window time when shorter than one hour", () => {
    const now = new Date("2026-06-25T08:20:00.000Z");
    const ttl = buildMeetingTokenTtlSeconds(event, now);
    assert.equal(ttl, 1500);
  });
});

describe("mintMeetingAccessToken", () => {
  it("returns jwt and room name for configured env", async () => {
    const now = new Date("2026-06-25T08:10:00.000Z");
    const ttl = buildMeetingTokenTtlSeconds(event, now);
    const minted = await mintMeetingAccessToken(
      user,
      event,
      {
        url: "wss://example.livekit.cloud",
        apiKey: "devkey",
        apiSecret: "devsecret",
      },
      now,
    );

    assert.equal(minted.roomName, "sharp-spice-cal-evt-video");
    assert.ok(minted.token.length > 20);
    assert.equal(
      minted.expiresAt,
      new Date(now.getTime() + ttl * 1000).toISOString(),
    );
  });
});
