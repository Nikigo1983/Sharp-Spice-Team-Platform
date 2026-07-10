import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMessagePreview } from "./message-preview";
import type { TeamChatMessage } from "./types";

function baseMessage(
  overrides: Partial<TeamChatMessage>,
): TeamChatMessage {
  return {
    id: "1",
    user_id: "u1",
    user_name: "Test",
    user_role: "manager",
    message_type: "text",
    message_text: "Hello",
    audio_url: null,
    audio_duration_ms: null,
    image_url: null,
    file_url: null,
    file_name: null,
    file_content_type: null,
    file_size: null,
    reply_to_message_id: null,
    reply_to_user_name: null,
    reply_to_message_type: null,
    reply_to_preview: null,
    is_pinned: false,
    pinned_at: null,
    pinned_by_user_id: null,
    created_at: "2026-07-10T07:00:00.000Z",
    updated_at: "2026-07-10T07:00:00.000Z",
    ...overrides,
  };
}

describe("buildMessagePreview", () => {
  it("uses voice label for voice messages", () => {
    const preview = buildMessagePreview(
      baseMessage({ message_type: "voice", message_text: "" }),
    );
    assert.match(preview, /голосовое/i);
  });

  it("uses file name for file messages", () => {
    const preview = buildMessagePreview(
      baseMessage({
        message_type: "file",
        file_name: "contract.pdf",
        message_text: "",
      }),
    );
    assert.equal(preview, "contract.pdf");
  });
});
