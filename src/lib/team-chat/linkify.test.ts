import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkifyText } from "@/lib/team-chat/linkify";

describe("linkifyText", () => {
  it("splits plain text and http URLs", () => {
    const parts = linkifyText(
      "Папка: https://drive.google.com/drive/folders/abc?usp=sharing",
    );
    assert.equal(parts.length, 2);
    assert.deepEqual(parts[0], { type: "text", value: "Папка: " });
    assert.equal(parts[1].type, "link");
    if (parts[1].type === "link") {
      assert.equal(
        parts[1].href,
        "https://drive.google.com/drive/folders/abc?usp=sharing",
      );
    }
  });

  it("keeps trailing punctuation outside the link", () => {
    const parts = linkifyText("Смотри https://example.com/docs).");
    assert.equal(parts.length, 3);
    assert.deepEqual(parts[2], { type: "text", value: ")." });
  });
});
