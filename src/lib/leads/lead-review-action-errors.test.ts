import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatLeadReviewActionUserMessage,
  resolveDuplicateErrorCode,
  resolveValidationErrorCode,
} from "@/lib/leads/lead-review-action-errors";
import type { LeadDuplicateMatch } from "@/lib/leads/lead-review-types";

function strongMatch(source: LeadDuplicateMatch["source"]): LeadDuplicateMatch {
  return {
    matchType: "strong",
    source,
    name: "Test Client",
    reasons: ["signal"],
  };
}

describe("resolveValidationErrorCode", () => {
  it("prioritizes test_lead_detected", () => {
    assert.equal(
      resolveValidationErrorCode(["phone_invalid", "test_lead_detected"]),
      "test_lead_detected",
    );
  });

  it("returns phone_invalid when phone is the issue", () => {
    assert.equal(resolveValidationErrorCode(["phone_invalid"]), "phone_invalid");
  });

  it("falls back to validation_error", () => {
    assert.equal(
      resolveValidationErrorCode(["name_invalid", "passport_invalid"]),
      "validation_error",
    );
  });
});

describe("resolveDuplicateErrorCode", () => {
  it("returns duplicate_detected_crm when CRM is in blocking matches", () => {
    assert.equal(
      resolveDuplicateErrorCode([strongMatch("crm")]),
      "duplicate_detected_crm",
    );
  });

  it("returns duplicate_detected for formgrid-only blocking match", () => {
    assert.equal(
      resolveDuplicateErrorCode([strongMatch("formgrid")]),
      "duplicate_detected",
    );
  });
});

describe("formatLeadReviewActionUserMessage", () => {
  it("maps duplicate_detected_crm", () => {
    const message = formatLeadReviewActionUserMessage("duplicate_detected_crm");
    assert.match(message, /CRM/i);
    assert.doesNotMatch(message, /Не удалось выполнить действие/);
  });

  it("maps test_lead_detected", () => {
    const message = formatLeadReviewActionUserMessage("test_lead_detected");
    assert.match(message, /тестовый/i);
  });

  it("maps phone_invalid", () => {
    const message = formatLeadReviewActionUserMessage("phone_invalid");
    assert.match(message, /телефон/i);
  });

  it("maps validation_error", () => {
    const message = formatLeadReviewActionUserMessage("validation_error");
    assert.match(message, /обязательных данных/i);
  });
});
