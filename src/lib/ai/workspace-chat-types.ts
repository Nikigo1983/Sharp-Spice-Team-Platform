import type { WorkspaceChatTurn } from "@/lib/ai/workspace-assistant";

export type { WorkspaceChatTurn };

export type WorkspaceChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: WorkspaceChatTurn[];
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
