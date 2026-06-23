import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUser } from "@/lib/auth/types";
import type { CalendarEvent } from "./types";
import {
  canCreateWithScope,
  canDeleteEvent,
  canEditEvent,
  canViewEvent,
} from "./permissions-client";

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

const owner: SessionUser = {
  id: "veronika",
  name: "Вероника",
  email: "owner@test.com",
  role: "owner",
};

function companyEvent(createdByUserId: string): CalendarEvent {
  return {
    id: "evt-company",
    companyId: "sharp-spice",
    scope: "company",
    ownerUserId: null,
    title: "Собрание",
    description: "",
    eventType: "general",
    startAt: "2026-06-20T12:00:00.000Z",
    endAt: "2026-06-20T13:00:00.000Z",
    allDay: false,
    location: "",
    sendReminders: true,
    createdByUserId,
    createdByName: "Author",
    updatedByUserId: null,
    createdAt: "2026-06-19T12:00:00.000Z",
    updatedAt: "2026-06-19T12:00:00.000Z",
  };
}

describe("permissions-client", () => {
  it("allows both scopes for create", () => {
    assert.equal(canCreateWithScope(managerA, "personal"), true);
    assert.equal(canCreateWithScope(managerA, "company"), true);
  });

  it("hides foreign personal events from view", () => {
    const personal: CalendarEvent = {
      ...companyEvent(managerA.id),
      scope: "personal",
      ownerUserId: managerA.id,
    };
    assert.equal(canViewEvent(managerA, personal), true);
    assert.equal(canViewEvent(managerB, personal), false);
  });

  it("gates company edit/delete by creator or owner", () => {
    const event = companyEvent(managerA.id);
    assert.equal(canEditEvent(managerA, event), true);
    assert.equal(canDeleteEvent(managerA, event), true);
    assert.equal(canEditEvent(managerB, event), false);
    assert.equal(canEditEvent(owner, event), true);
  });
});
