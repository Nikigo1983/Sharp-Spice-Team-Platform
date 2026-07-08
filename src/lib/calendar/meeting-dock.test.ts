import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMeetingDockWindowName,
  isMeetingDockMode,
  markMeetingDockActive,
  readMeetingDockSession,
} from "./meeting-dock";

describe("meeting dock helpers", () => {
  it("builds stable popup window names", () => {
    assert.equal(getMeetingDockWindowName("evt-1"), "ss-meeting-evt-1");
  });

  it("detects dock query param", () => {
    assert.equal(
      isMeetingDockMode(new URLSearchParams("dock=1")),
      true,
    );
    assert.equal(isMeetingDockMode(new URLSearchParams()), false);
  });

  it("round-trips dock session metadata in sessionStorage", () => {
    const storage = new Map<string, string>();
    const original = globalThis.sessionStorage;
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });

    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    try {
      markMeetingDockActive({
        eventId: "evt-42",
        title: "Синк",
        openedAt: "2026-06-25T10:00:00.000Z",
      });

      assert.deepEqual(readMeetingDockSession(), {
        eventId: "evt-42",
        title: "Синк",
        openedAt: "2026-06-25T10:00:00.000Z",
      });
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: original,
      });
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
