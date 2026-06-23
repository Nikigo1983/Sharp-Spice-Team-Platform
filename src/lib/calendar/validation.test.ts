import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent, CreateCalendarEventInput } from "./types";
import {
  CalendarValidationError,
  parseIsoRange,
  validateCreateInput,
  validateUpdateInput,
} from "./validation";

function createInput(
  overrides: Partial<CreateCalendarEventInput> = {},
): CreateCalendarEventInput {
  return {
    scope: "personal",
    ownerUserId: "manager-1",
    title: "Meeting",
    startAt: "2026-06-20T08:00:00.000Z",
    endAt: "2026-06-20T09:00:00.000Z",
    createdByUserId: "manager-1",
    createdByName: "Злата",
    ...overrides,
  };
}

function existingEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    companyId: "sharp-spice",
    scope: "personal",
    ownerUserId: "manager-1",
    title: "Meeting",
    description: "",
    eventType: "general",
    startAt: "2026-06-20T08:00:00.000Z",
    endAt: "2026-06-20T09:00:00.000Z",
    allDay: false,
    location: "",
    sendReminders: true,
    createdByUserId: "manager-1",
    createdByName: "Злата",
    updatedByUserId: null,
    createdAt: "2026-06-19T12:00:00.000Z",
    updatedAt: "2026-06-19T12:00:00.000Z",
    ...overrides,
  };
}

describe("validateCreateInput", () => {
  it("accepts valid personal event", () => {
    assert.doesNotThrow(() => validateCreateInput(createInput()));
  });

  it("accepts valid company event without ownerUserId", () => {
    assert.doesNotThrow(() =>
      validateCreateInput(
        createInput({
          scope: "company",
          ownerUserId: null,
        }),
      ),
    );
  });

  it("rejects empty title", () => {
    assert.throws(
      () => validateCreateInput(createInput({ title: "   " })),
      CalendarValidationError,
    );
  });

  it("rejects personal without ownerUserId", () => {
    assert.throws(
      () => validateCreateInput(createInput({ ownerUserId: null })),
      CalendarValidationError,
    );
  });

  it("rejects endAt before startAt", () => {
    assert.throws(
      () =>
        validateCreateInput(
          createInput({
            startAt: "2026-06-20T10:00:00.000Z",
            endAt: "2026-06-20T09:00:00.000Z",
          }),
        ),
      CalendarValidationError,
    );
  });

  it("rejects missing createdByUserId", () => {
    assert.throws(
      () => validateCreateInput(createInput({ createdByUserId: "" })),
      CalendarValidationError,
    );
  });

  it("rejects non-boolean sendReminders", () => {
    assert.throws(
      () =>
        validateCreateInput(
          createInput({ sendReminders: "yes" as unknown as boolean }),
        ),
      CalendarValidationError,
    );
  });
});

describe("validateUpdateInput", () => {
  it("accepts partial update with valid times", () => {
    assert.doesNotThrow(() =>
      validateUpdateInput(existingEvent(), { title: "Updated" }),
    );
  });

  it("rejects update that makes endAt before startAt", () => {
    assert.throws(
      () =>
        validateUpdateInput(existingEvent(), {
          startAt: "2026-06-20T12:00:00.000Z",
        }),
      CalendarValidationError,
    );
  });
});

describe("parseIsoRange", () => {
  it("returns trimmed range when valid", () => {
    const range = parseIsoRange(
      " 2026-06-01T00:00:00.000Z ",
      "2026-06-30T00:00:00.000Z",
    );
    assert.equal(range.from, "2026-06-01T00:00:00.000Z");
    assert.equal(range.to, "2026-06-30T00:00:00.000Z");
  });

  it("rejects invalid timestamps", () => {
    assert.throws(
      () => parseIsoRange("not-a-date", "2026-06-30T00:00:00.000Z"),
      CalendarValidationError,
    );
  });

  it("rejects to before from", () => {
    assert.throws(
      () =>
        parseIsoRange(
          "2026-06-30T00:00:00.000Z",
          "2026-06-01T00:00:00.000Z",
        ),
      CalendarValidationError,
    );
  });
});
