import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientContext } from "@/lib/ai/client-context";
import {
  extractPassportFromClientRecord,
  normalizePassport,
  passportsMatch,
} from "@/lib/ai/client-passport";

function ctx(
  partial: Partial<ClientContext> & Pick<ClientContext, "source" | "name">,
): ClientContext {
  return {
    sourceLabel: partial.source === "clients" ? "Клиенты" : "Новые клиенты",
    rowIndex: 1,
    phone: "",
    email: "",
    country: "",
    direction: "",
    status: "",
    manager: "",
    lastActivity: "",
    surveyData: "",
    score: 50,
    matchedFields: [],
    debugRow: {},
    ...partial,
  };
}

describe("normalizePassport", () => {
  it("strips spaces and №", () => {
    assert.equal(normalizePassport("77 7063956"), "777063956");
    assert.equal(normalizePassport("№ 777063956"), "777063956");
    assert.equal(normalizePassport("777063956"), "777063956");
  });

  it("uppercases letters and removes dashes", () => {
    assert.equal(normalizePassport("ab-12 34cd"), "AB1234CD");
    assert.equal(normalizePassport("no. 1234567"), "1234567");
  });
});

describe("extractPassportFromClientRecord", () => {
  it("reads passport from CRM debugRow.passport", () => {
    const record = ctx({
      source: "clients",
      name: "Иванов",
      debugRow: { passport: "77 7063956" },
    });
    const extracted = extractPassportFromClientRecord(record);
    assert.equal(extracted.raw, "77 7063956");
    assert.equal(extracted.normalized, "777063956");
  });

  it("reads passport from Formgrid header key", () => {
    const record = ctx({
      source: "new_clients",
      name: "Петров",
      debugRow: {
        "8. № заграничного паспорта": "№ 123456789",
      },
    });
    const extracted = extractPassportFromClientRecord(record);
    assert.equal(extracted.normalized, "123456789");
  });

  it("reads passport via passportNumber on input object", () => {
    const extracted = extractPassportFromClientRecord({
      passportNumber: "aa1234567",
      debugRow: {},
    });
    assert.equal(extracted.normalized, "AA1234567");
  });
});

describe("passportsMatch", () => {
  it("matches equivalent formats", () => {
    const left = ctx({
      source: "clients",
      name: "A",
      debugRow: { passport: "77 7063956" },
    });
    const right = ctx({
      source: "new_clients",
      name: "B",
      debugRow: { "8. № заграничного паспорта": "№777063956" },
    });
    assert.equal(passportsMatch(left, right), true);
  });

  it("rejects different passports", () => {
    const left = ctx({
      source: "clients",
      name: "A",
      debugRow: { passport: "1111111" },
    });
    const right = ctx({
      source: "new_clients",
      name: "B",
      debugRow: { passport: "2222222" },
    });
    assert.equal(passportsMatch(left, right), false);
  });
});
