import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDateKey,
  buildTimeValue,
  formatDateKeyRu,
  formatTimeValueRu,
  parseDateKey,
  parseTimeParts,
  snapMinuteToStep,
} from "./datetime-input";

describe("datetime-input", () => {
  it("parses and formats Russian date keys", () => {
    assert.deepEqual(parseDateKey("2026-06-22"), {
      year: 2026,
      month: 6,
      day: 22,
    });
    assert.equal(formatDateKeyRu("2026-06-22"), "22.06.2026");
    assert.equal(
      buildDateKey({ year: 2026, month: 6, day: 22 }),
      "2026-06-22",
    );
  });

  it("parses and formats 24-hour time values", () => {
    assert.deepEqual(parseTimeParts("13:30"), { hours: 13, minutes: 30 });
    assert.equal(formatTimeValueRu("09:05"), "09:05");
    assert.equal(buildTimeValue({ hours: 23, minutes: 45 }), "23:45");
  });

  it("snaps minutes to the nearest step", () => {
    assert.equal(snapMinuteToStep(7, 5), 5);
    assert.equal(snapMinuteToStep(8, 5), 10);
  });
});
