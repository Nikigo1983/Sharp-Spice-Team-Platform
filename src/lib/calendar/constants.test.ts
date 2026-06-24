import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CALENDAR_DEFAULT_SEND_REMINDERS,
  REMINDER_CRON_INTERVAL_MS,
  REMINDER_CRON_WINDOW_MS,
  REMINDER_GRACE_WINDOW_MS,
  REMINDER_OFFSETS_MINUTES,
} from "./constants";

describe("calendar reminder constants", () => {
  it("uses 24h and 1h offsets", () => {
    assert.deepEqual(REMINDER_OFFSETS_MINUTES, [1440, 60]);
  });

  it("defaults send reminders to true", () => {
    assert.equal(CALENDAR_DEFAULT_SEND_REMINDERS, true);
  });

  it("aligns cron window with interval", () => {
    assert.equal(REMINDER_CRON_WINDOW_MS, REMINDER_CRON_INTERVAL_MS);
    assert.equal(REMINDER_GRACE_WINDOW_MS, 6 * 60 * 60 * 1000);
    assert.equal(REMINDER_CRON_INTERVAL_MS, 3 * 60 * 60 * 1000);
  });
});
