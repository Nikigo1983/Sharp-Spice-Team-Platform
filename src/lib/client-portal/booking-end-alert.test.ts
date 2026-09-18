import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOOKING_END_WARN_DAYS,
  formatBookingEndAlertRu,
  getBookingEndAlert,
  parseBookingEndDate,
} from "@/lib/client-portal/booking-end-alert";

describe("parseBookingEndDate", () => {
  it("reads full range with years", () => {
    const end = parseBookingEndDate("20.05.2026 — 25.05.2026");
    assert.ok(end);
    assert.equal(end!.getFullYear(), 2026);
    assert.equal(end!.getMonth(), 4);
    assert.equal(end!.getDate(), 25);
  });

  it("reads shorthand DD.MM-DD.MM relative to today", () => {
    const today = new Date(2026, 9, 1); // 1 Oct 2026
    const end = parseBookingEndDate("16.10-23.10", today);
    assert.ok(end);
    assert.equal(end!.getFullYear(), 2026);
    assert.equal(end!.getMonth(), 9);
    assert.equal(end!.getDate(), 23);
  });

  it("cross-year shorthand start Dec end Jan", () => {
    const today = new Date(2026, 11, 20); // 20 Dec 2026
    const end = parseBookingEndDate("28.12-05.01", today);
    assert.ok(end);
    assert.equal(end!.getFullYear(), 2027);
    assert.equal(end!.getMonth(), 0);
    assert.equal(end!.getDate(), 5);
  });
});

describe("getBookingEndAlert", () => {
  it("flags ending within warn window", () => {
    const today = new Date(2026, 9, 20); // 20 Oct
    const alert = getBookingEndAlert("16.10-23.10", {
      today,
      warnDays: BOOKING_END_WARN_DAYS,
    });
    assert.ok(alert);
    assert.equal(alert!.kind, "ending_soon");
    assert.equal(alert!.daysRemaining, 3);
    assert.match(formatBookingEndAlertRu(alert!), /через 3 дн/);
  });

  it("flags already ended", () => {
    const today = new Date(2026, 9, 25);
    const alert = getBookingEndAlert("16.10.2026-23.10.2026", { today });
    assert.ok(alert);
    assert.equal(alert!.kind, "ended");
    assert.equal(alert!.daysRemaining, -2);
  });

  it("ignores distant future ends", () => {
    const today = new Date(2026, 0, 1);
    const alert = getBookingEndAlert("01.06.2026-10.06.2026", { today });
    assert.equal(alert, null);
  });
});
