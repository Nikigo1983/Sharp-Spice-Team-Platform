import type { WorkspaceChatTurn } from "@/lib/ai/workspace-assistant";
import type { WorkspaceCaseMemory } from "@/lib/ai/workspace-case-memory";

export type { WorkspaceChatTurn };

export type WorkspaceChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: WorkspaceChatTurn[];
  /** Rolling dialogue/case summary for model memory (not shown as a chat bubble). */
  conversationSummary?: string | null;
  /** How many messages were covered by conversationSummary. */
  summaryThroughMessageCount?: number;
  /** Structured case facts accumulated for this chat. */
  caseMemory?: WorkspaceCaseMemory | null;
  caseMemoryThroughMessageCount?: number;
};

export type WorkspaceChatSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
};

export const MAX_WORKSPACE_CHATS = 100;
