import "server-only";

import { createChatCompletionResult } from "@/lib/ai/openai";
import { getWorkspaceAiConfig } from "@/lib/ai/workspace-config";
import {
  buildCaseMemoryExtractPrompt,
  mergeCaseMemory,
  mergeCaseMemoryFromClientSnapshot,
  parseCaseMemoryFromModelText,
  shouldRefreshCaseMemory,
  type CaseMemoryClientSnapshot,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";
import {
  buildConversationSummaryPrompt,
  sanitizeConversationSummary,
  shouldRefreshConversationSummary,
  type ConversationMemoryState,
} from "@/lib/ai/workspace-conversation-memory";
import {
  getWorkspaceChatMemory,
  setWorkspaceChatMemory,
} from "@/lib/ai/workspace-chat-memory-store";

type Turn = { role: string; content: string };

async function extractCaseMemoryFromTurns(params: {
  previous: WorkspaceCaseMemory | null;
  turns: Turn[];
}): Promise<WorkspaceCaseMemory | null> {
  const prompt = buildCaseMemoryExtractPrompt(params);
  const completion = await createChatCompletionResult(
    [
      {
        role: "system",
        content:
          "Ты модуль структурированной памяти кейса. Верни только валидный JSON-объект.",
      },
      { role: "user", content: prompt },
    ],
    {
      model: getWorkspaceAiConfig().model,
      temperature: 0.1,
      maxTokens: 500,
    },
  );
  return completion.ok ? parseCaseMemoryFromModelText(completion.content) : null;
}

/**
 * Refresh dialogue summary and/or structured case memory as needed.
 * Optionally merge deterministic CRM client snapshot into case memory.
 */
export async function maybeRefreshWorkspaceConversationMemory(params: {
  userId: string;
  chatId: string;
  turns: Turn[];
  clientSnapshot?: CaseMemoryClientSnapshot | null;
}): Promise<ConversationMemoryState | null> {
  const { userId, chatId, turns, clientSnapshot } = params;
  const current = await getWorkspaceChatMemory(userId, chatId);

  let next: ConversationMemoryState = { ...current };
  let changed = false;

  if (clientSnapshot) {
    const merged = mergeCaseMemoryFromClientSnapshot(
      next.caseMemory,
      clientSnapshot,
    );
    if (JSON.stringify(merged) !== JSON.stringify(next.caseMemory)) {
      next = { ...next, caseMemory: merged };
      changed = true;
    }
  }

  const refreshSummary = shouldRefreshConversationSummary(
    turns.length,
    next.summaryThroughMessageCount,
  );
  const refreshCase = shouldRefreshCaseMemory(
    turns.length,
    next.caseMemoryThroughMessageCount,
  );

  if (!refreshSummary && !refreshCase && !changed) {
    return null;
  }

  try {
    if (refreshCase) {
      const extracted = await extractCaseMemoryFromTurns({
        previous: next.caseMemory,
        turns,
      });
      if (extracted) {
        next = {
          ...next,
          caseMemory: mergeCaseMemory(next.caseMemory, extracted),
          caseMemoryThroughMessageCount: turns.length,
        };
        changed = true;
      } else {
        next = {
          ...next,
          caseMemoryThroughMessageCount: turns.length,
        };
        changed = true;
      }
    }

    if (refreshSummary) {
      const prompt = buildConversationSummaryPrompt({
        previousSummary: next.conversationSummary,
        turns,
      });
      const completion = await createChatCompletionResult(
        [
          {
            role: "system",
            content:
              "Ты модуль памяти кейса. Верни только обновлённую сводку без преамбулы.",
          },
          { role: "user", content: prompt },
        ],
        {
          model: getWorkspaceAiConfig().model,
          temperature: 0.2,
          maxTokens: 700,
        },
      );
      const summary = completion.ok ? sanitizeConversationSummary(completion.content) : null;
      if (summary) {
        next = {
          ...next,
          conversationSummary: summary,
          summaryThroughMessageCount: turns.length,
        };
        changed = true;
      }
    }

    if (!changed) return null;
    return setWorkspaceChatMemory(userId, chatId, next);
  } catch (error) {
    console.error("[workspace-conversation-memory] refresh failed", error);
    if (changed) {
      try {
        return await setWorkspaceChatMemory(userId, chatId, next);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** @deprecated use maybeRefreshWorkspaceConversationMemory */
export async function maybeRefreshWorkspaceConversationSummary(params: {
  userId: string;
  chatId: string;
  turns: Turn[];
}): Promise<ConversationMemoryState | null> {
  return maybeRefreshWorkspaceConversationMemory(params);
}
