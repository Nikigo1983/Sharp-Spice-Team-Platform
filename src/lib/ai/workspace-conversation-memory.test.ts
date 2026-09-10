import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConversationSummaryPrompt,
  formatConversationSummaryForPrompt,
  selectRecentHistoryTurns,
  shouldRefreshConversationSummary,
  WORKSPACE_RECENT_HISTORY_TURNS,
  WORKSPACE_SUMMARY_EVERY_TURNS,
  WORKSPACE_SUMMARY_MIN_TURNS,
} from "@/lib/ai/workspace-conversation-memory";

describe("workspace conversation memory", () => {
  it("keeps only the recent N turns", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
    }));
    const recent = selectRecentHistoryTurns(history);
    assert.equal(recent.length, WORKSPACE_RECENT_HISTORY_TURNS);
    assert.equal(recent[0]?.content, "m10");
    assert.equal(recent.at(-1)?.content, "m29");
  });

  it("refreshes summary on the configured cadence", () => {
    assert.equal(
      shouldRefreshConversationSummary(WORKSPACE_SUMMARY_MIN_TURNS - 1, 0),
      false,
    );
    assert.equal(
      shouldRefreshConversationSummary(WORKSPACE_SUMMARY_MIN_TURNS, 0),
      true,
    );
    assert.equal(
      shouldRefreshConversationSummary(
        WORKSPACE_SUMMARY_MIN_TURNS + WORKSPACE_SUMMARY_EVERY_TURNS - 1,
        WORKSPACE_SUMMARY_MIN_TURNS,
      ),
      false,
    );
    assert.equal(
      shouldRefreshConversationSummary(
        WORKSPACE_SUMMARY_MIN_TURNS + WORKSPACE_SUMMARY_EVERY_TURNS,
        WORKSPACE_SUMMARY_MIN_TURNS,
      ),
      true,
    );
  });

  it("formats summary block for model prompt", () => {
    const block = formatConversationSummaryForPrompt(
      "Клиент: Иван.\nГражданство: РФ.",
    );
    assert.match(block, /СВОДКА ДИАЛОГА/);
    assert.match(block, /Иван/);
    assert.equal(formatConversationSummaryForPrompt("  "), "");
  });

  it("builds summary update prompt with previous memory", () => {
    const prompt = buildConversationSummaryPrompt({
      previousSummary: "Клиент: Анна",
      turns: [
        { role: "user", content: "Паспорт 123" },
        { role: "assistant", content: "Записал паспорт." },
      ],
    });
    assert.match(prompt, /Предыдущая сводка/);
    assert.match(prompt, /Анна/);
    assert.match(prompt, /Паспорт 123/);
  });
});
