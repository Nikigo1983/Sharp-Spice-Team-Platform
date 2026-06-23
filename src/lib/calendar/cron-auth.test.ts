import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyCalendarCronRequest } from "./cron-auth";

describe("verifyCalendarCronRequest", () => {
  it("rejects missing authorization header", () => {
    const request = new Request("http://localhost/api/cron/calendar-reminders");
    assert.equal(
      verifyCalendarCronRequest(request, { secret: "test-cron-secret" }),
      false,
    );
  });

  it("rejects wrong bearer token", () => {
    const request = new Request("http://localhost/api/cron/calendar-reminders", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    assert.equal(
      verifyCalendarCronRequest(request, { secret: "test-cron-secret" }),
      false,
    );
  });

  it("accepts matching bearer token", () => {
    const request = new Request("http://localhost/api/cron/calendar-reminders", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    assert.equal(
      verifyCalendarCronRequest(request, { secret: "test-cron-secret" }),
      true,
    );
  });

  it("rejects when CRON_SECRET is not configured", () => {
    const request = new Request("http://localhost/api/cron/calendar-reminders", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    assert.equal(verifyCalendarCronRequest(request, { secret: null }), false);
  });
});
