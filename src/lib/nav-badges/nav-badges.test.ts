import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isNavBadgeHref,
  pathnameToNavBadgeHref,
  NAV_BADGE_NOTIFICATION_TYPES,
} from "@/lib/nav-badges/types";

describe("nav-badges types", () => {
  it("recognizes badge hrefs", () => {
    assert.equal(isNavBadgeHref("/tasks"), true);
    assert.equal(isNavBadgeHref("/spiora/clients"), true);
    assert.equal(isNavBadgeHref("/dashboard"), false);
  });

  it("maps nested paths to badge href", () => {
    assert.equal(pathnameToNavBadgeHref("/calendar/meet/abc"), "/calendar");
    assert.equal(pathnameToNavBadgeHref("/tasks/new"), "/tasks");
    assert.equal(pathnameToNavBadgeHref("/clients/intake"), "/clients/intake");
    assert.equal(pathnameToNavBadgeHref("/dashboard"), null);
  });

  it("keeps notification type maps for formgrid/tasks/calendar", () => {
    assert.ok(
      NAV_BADGE_NOTIFICATION_TYPES["/new-formgrid-clients"].includes(
        "client_new",
      ),
    );
    assert.ok(NAV_BADGE_NOTIFICATION_TYPES["/tasks"].includes("task_new"));
    assert.ok(
      NAV_BADGE_NOTIFICATION_TYPES["/calendar"].includes("calendar_reminder"),
    );
  });
});
