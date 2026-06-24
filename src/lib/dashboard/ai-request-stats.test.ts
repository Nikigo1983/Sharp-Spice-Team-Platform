import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countUserMessagesInSessionsSince,
  countUserRoleMessages,
  isUserChatMessage,
} from "./ai-request-stats";

describe("isUserChatMessage", () => {
  it("accepts user role messages", () => {
    assert.equal(
      isUserChatMessage({ role: "user", content: "Привет" }),
      true,
    );
  });

  it("rejects assistant messages", () => {
    assert.equal(
      isUserChatMessage({ role: "assistant", content: "Ответ" }),
      false,
    );
  });
});

describe("countUserRoleMessages", () => {
  it("counts only user messages", () => {
    assert.equal(
      countUserRoleMessages([
        { role: "user", content: "1" },
        { role: "assistant", content: "2" },
        { role: "user", content: "3" },
      ]),
      2,
    );
  });
});

describe("countUserMessagesInSessionsSince", () => {
  it("counts user messages in recently updated sessions", () => {
    const since = new Date("2026-06-01T00:00:00.000Z");
    const total = countUserMessagesInSessionsSince(
      [
        {
          updatedAt: "2026-06-10T12:00:00.000Z",
          messages: [
            { role: "user", content: "a" },
            { role: "assistant", content: "b" },
          ],
        },
        {
          updatedAt: "2026-05-01T12:00:00.000Z",
          messages: [{ role: "user", content: "old" }],
        },
      ],
      since,
    );

    assert.equal(total, 1);
  });
});
