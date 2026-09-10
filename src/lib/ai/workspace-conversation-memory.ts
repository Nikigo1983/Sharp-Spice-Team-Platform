/**
 * Conversation memory for AI Workspace:
 * recent turns + rolling case/dialog summary + structured case memory.
 */

import {
  sanitizeCaseMemory,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";

export const WORKSPACE_RECENT_HISTORY_TURNS = 20;
/** Refresh rolling summary after this many new turns since last summary. */
export const WORKSPACE_SUMMARY_EVERY_TURNS = 12;
/** First summary once the chat reaches this many turns. */
export const WORKSPACE_SUMMARY_MIN_TURNS = 12;
export const WORKSPACE_SUMMARY_MAX_CHARS = 2800;
export const WORKSPACE_SUMMARY_SOURCE_TURN_CAP = 40;

export type ConversationMemoryState = {
  conversationSummary: string | null;
  summaryThroughMessageCount: number;
  caseMemory: WorkspaceCaseMemory | null;
  caseMemoryThroughMessageCount: number;
};

export function emptyConversationMemory(): ConversationMemoryState {
  return {
    conversationSummary: null,
    summaryThroughMessageCount: 0,
    caseMemory: null,
    caseMemoryThroughMessageCount: 0,
  };
}

export function selectRecentHistoryTurns<T>(
  history: T[],
  limit: number = WORKSPACE_RECENT_HISTORY_TURNS,
): T[] {
  if (limit <= 0) return [];
  if (history.length <= limit) return history;
  return history.slice(-limit);
}

export function shouldRefreshConversationSummary(
  totalMessageCount: number,
  summaryThroughMessageCount: number,
): boolean {
  if (totalMessageCount < WORKSPACE_SUMMARY_MIN_TURNS) return false;
  const covered = Math.max(0, summaryThroughMessageCount);
  return totalMessageCount - covered >= WORKSPACE_SUMMARY_EVERY_TURNS;
}

export function formatConversationSummaryForPrompt(
  summary: string | null | undefined,
): string {
  const trimmed = (summary ?? "").trim();
  if (!trimmed) return "";
  return [
    "=== СВОДКА ДИАЛОГА ===",
    "Используй как сжатую память более ранней переписки. При конфликте с CLIENT CONTEXT / authoritative-блоками приоритет у них.",
    trimmed.slice(0, WORKSPACE_SUMMARY_MAX_CHARS),
  ].join("\n");
}

export function buildConversationSummaryPrompt(params: {
  previousSummary: string | null;
  turns: Array<{ role: string; content: string }>;
}): string {
  const previous = (params.previousSummary ?? "").trim();
  const transcript = params.turns
    .slice(-WORKSPACE_SUMMARY_SOURCE_TURN_CAP)
    .map((turn) => {
      const role = turn.role === "assistant" ? "Ассистент" : "Менеджер";
      const content = turn.content.trim().slice(0, 1200);
      return `${role}: ${content}`;
    })
    .join("\n\n");

  return [
    "Обнови краткую структурированную сводку кейса по диалогу менеджера Sharp & Spice.",
    "Пиши по-русски, коротко, только факты. Формат:",
    "Клиент:",
    "Гражданство:",
    "Паспорт:",
    "Куда подаётся / виза:",
    "ВНЖ других стран:",
    "Работодатели / адреса:",
    "Даты:",
    "Особые комментарии / запреты:",
    "Открытые вопросы:",
    "",
    "Не выдумывай поля. Если неизвестно — пиши «не указано».",
    "Не включай секреты, пароли, appPassword, токены.",
    previous
      ? `Предыдущая сводка:\n${previous.slice(0, WORKSPACE_SUMMARY_MAX_CHARS)}`
      : "Предыдущей сводки ещё нет.",
    "",
    "Фрагмент диалога:",
    transcript || "(пусто)",
  ].join("\n");
}

export function sanitizeConversationSummary(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, WORKSPACE_SUMMARY_MAX_CHARS);
}

export function normalizeConversationMemoryState(
  value: Partial<ConversationMemoryState> | null | undefined,
): ConversationMemoryState {
  return {
    conversationSummary: sanitizeConversationSummary(
      value?.conversationSummary ?? null,
    ),
    summaryThroughMessageCount: Math.max(
      0,
      Math.floor(Number(value?.summaryThroughMessageCount) || 0),
    ),
    caseMemory: sanitizeCaseMemory(value?.caseMemory ?? null),
    caseMemoryThroughMessageCount: Math.max(
      0,
      Math.floor(Number(value?.caseMemoryThroughMessageCount) || 0),
    ),
  };
}
