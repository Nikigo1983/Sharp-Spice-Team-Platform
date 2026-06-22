import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysToDateKey,
  formatDateKey,
  getRangeForView,
  isCalendarViewMode,
  parseDateKey,
  shiftAnchorDate,
} from "./range";

describe("isCalendarViewMode", () => {
  it("accepts known views", () => {
    assert.equal(isCalendarViewMode("day"), true);
    assert.equal(isCalendarViewMode("week"), true);
    assert.equal(isCalendarViewMode("month"), true);
    assert.equal(isCalendarViewMode("year"), false);
  });
});

describe("getRangeForView", () => {
  it("returns half-open day range", () => {
    const anchor = parseDateKey("2026-06-20");
    const range = getRangeForView("day", anchor);
    assert.ok(range.from < range.to);
    assert.equal(range.from.endsWith("Z"), true);
    assert.equal(range.to.endsWith("Z"), true);
  });

  it("returns week range spanning seven days", () => {
    const anchor = parseDateKey("2026-06-20");
    const range = getRangeForView("week", anchor);
    const fromMs = Date.parse(range.from);
    const toMs = Date.parse(range.to);
    const diffDays = (toMs - fromMs) / 86_400_000;
    assert.ok(diffDays >= 7 && diffDays <= 8);
  });

  it("returns padded month range", () => {
    const anchor = parseDateKey("2026-06-15");
    const range = getRangeForView("month", anchor);
    const fromMs = Date.parse(range.from);
    const toMs = Date.parse(range.to);
    const diffDays = (toMs - fromMs) / 86_400_000;
    assert.ok(diffDays >= 28);
  });
});

describe("shiftAnchorDate", () => {
  it("shifts by one day in day view", () => {
    const anchor = parseDateKey("2026-06-20");
    const next = shiftAnchorDate("day", anchor, 1);
    assert.equal(formatDateKey(next), addDaysToDateKey("2026-06-20", 1));
  });

  it("shifts by one month in month view", () => {
    const anchor = parseDateKey("2026-06-20");
    const next = shiftAnchorDate("month", anchor, 1);
    assert.equal(formatDateKey(next), "2026-07-20");
  });
});
