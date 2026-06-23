import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUser } from "@/lib/auth/types";
import type { CalendarEvent } from "./types";
import {
  canCreateWithScope,
  canDeleteEvent,
  canEditEvent,
  canViewEvent,
} from "./permissions";

const owner: SessionUser = {
  id: "veronika",
  name: "Вероника",
  email: "owner@test.com",
  role: "owner",
};

const managerA: SessionUser = {
  id: "manager-1",
  name: "Злата",
  email: "manager1@test.com",
  role: "manager",
};

const managerB: SessionUser = {
  id: "manager-2",
  name: "Юля",
  email: "manager2@test.com",
  role: "manager",
};

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    companyId: "sharp-spice",
    scope: "personal",
    ownerUserId: managerA.id,
    title: "Test",
    description: "",
    eventType: "general",
    videoInviteMode: null,
    participantUserIds: [],
    startAt: "2026-06-20T08:00:00.000Z",
    endAt: "2026-06-20T09:00:00.000Z",
    allDay: false,
    location: "",
    sendReminders: true,
    createdByUserId: managerA.id,
    createdByName: managerA.name,
    updatedByUserId: null,
    createdAt: "2026-06-19T12:00:00.000Z",
    updatedAt: "2026-06-19T12:00:00.000Z",
    ...overrides,
  };
}

describe("canViewEvent", () => {
  it("allows any user to view company events", () => {
    const company = event({
      scope: "company",
      ownerUserId: null,
      createdByUserId: owner.id,
    });
    assert.equal(canViewEvent(managerA, company), true);
    assert.equal(canViewEvent(managerB, company), true);
    assert.equal(canViewEvent(owner, company), true);
  });

  it("allows owner to view own personal events only", () => {
    const personal = event({ scope: "personal", ownerUserId: managerA.id });
    assert.equal(canViewEvent(managerA, personal), true);
    assert.equal(canViewEvent(managerB, personal), false);
    assert.equal(canViewEvent(owner, personal), false);
  });

  it("allows invited users to view selected personal video meetings", () => {
    const personalVideo = event({
      scope: "personal",
      ownerUserId: owner.id,
      eventType: "video_meeting",
      videoInviteMode: "selected",
      participantUserIds: [managerA.id],
      createdByUserId: owner.id,
      createdByName: owner.name,
    });
    assert.equal(canViewEvent(managerA, personalVideo), true);
    assert.equal(canViewEvent(managerB, personalVideo), false);
  });

  it("hides selected company video meetings from non-invited users", () => {
    const selectedVideo = event({
      scope: "company",
      ownerUserId: null,
      eventType: "video_meeting",
      videoInviteMode: "selected",
      participantUserIds: [managerA.id],
      createdByUserId: owner.id,
      createdByName: owner.name,
    });
    assert.equal(canViewEvent(managerA, selectedVideo), true);
    assert.equal(canViewEvent(managerB, selectedVideo), false);
  });
});

describe("canEditEvent", () => {
  it("allows personal owner to edit own event", () => {
    const personal = event({ scope: "personal", ownerUserId: managerA.id });
    assert.equal(canEditEvent(managerA, personal), true);
    assert.equal(canEditEvent(managerB, personal), false);
  });

  it("allows company creator to edit own company event", () => {
    const company = event({
      scope: "company",
      ownerUserId: null,
      createdByUserId: managerA.id,
    });
    assert.equal(canEditEvent(managerA, company), true);
    assert.equal(canEditEvent(managerB, company), false);
  });

  it("allows owner to edit any company event", () => {
    const company = event({
      scope: "company",
      ownerUserId: null,
      createdByUserId: managerA.id,
    });
    assert.equal(canEditEvent(owner, company), true);
  });
});

describe("canDeleteEvent", () => {
  it("mirrors edit permissions", () => {
    const company = event({
      scope: "company",
      ownerUserId: null,
      createdByUserId: managerA.id,
    });
    assert.equal(canDeleteEvent(managerA, company), true);
    assert.equal(canDeleteEvent(managerB, company), false);
    assert.equal(canDeleteEvent(owner, company), true);
  });
});

describe("canCreateWithScope", () => {
  it("allows personal and company for managers", () => {
    assert.equal(canCreateWithScope(managerA, "personal"), true);
    assert.equal(canCreateWithScope(managerA, "company"), true);
  });

  it("allows personal and company for owner", () => {
    assert.equal(canCreateWithScope(owner, "personal"), true);
    assert.equal(canCreateWithScope(owner, "company"), true);
  });
});
