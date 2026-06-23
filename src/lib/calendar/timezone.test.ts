import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatTimeZoneLabel,
  isValidIanaTimeZone,
  resolveBrowserTimeZone,
} from "./timezone";

describe("timezone helpers", () => {
  it("validates IANA time zones", () => {
    assert.equal(isValidIanaTimeZone("Europe/Moscow"), true);
    assert.equal(isValidIanaTimeZone("Not/AZone"), false);
  });

  it("falls back when browser timezone is unavailable", () => {
    assert.ok(resolveBrowserTimeZone().length > 0);
  });

  it("formats a readable label with offset", () => {
    const label = formatTimeZoneLabel("Europe/Moscow");
    assert.match(label, /Europe|Moscow|Москва/i);
    assert.match(label, /UTC|GMT|[+-]\d/);
  });
});
