import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { WorkspaceChatTurn } from "@/lib/ai/workspace-assistant";
import { sanitizeWorkspaceChatTurns } from "@/lib/ai/context-redaction";
import {
  MAX_WORKSPACE_CHATS,
  type WorkspaceChatSession,
  type WorkspaceChatSummary,
} from "@/lib/ai/workspace-chat-types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbChats from "@/lib/supabase/workspace-chats-repo";

export { MAX_WORKSPACE_CHATS };
export type { WorkspaceChatSession, WorkspaceChatSummary };

type UserChatStore = {
  sessions: WorkspaceChatSession[];
};

function getStoreDir(): string {
  return path.join(process.cwd(), ".data", "ai-workspace-chats");
}

function getStorePath(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(getStoreDir(), `${safe}.json`);
}

async function readStore(userId: string): Promise<UserChatStore> {
  const filePath = getStorePath(userId);
  try {
    const raw = await readFile(filePath, "utf8");
    const data = JSON.parse(raw) as UserChatStore;
    if (!Array.isArray(data.sessions)) return { sessions: [] };
    return data;
  } catch {
    return { sessions: [] };
  }
}

async function writeStore(userId: string, store: UserChatStore): Promise<void> {
  await mkdir(getStoreDir(), { recursive: true });
  store.sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  store.sessions = store.sessions.slice(0, MAX_WORKSPACE_CHATS);
  await writeFile(getStorePath(userId), JSON.stringify(store, null, 2), "utf8");
}

function makeTitle(firstMessage: string): string {
  const clean = firstMessage.trim().replace(/\s+/g, " ");
  if (!clean) return "Новый чат";
  return clean.length > 56 ? `${clean.slice(0, 56)}…` : clean;
}

function toSummary(session: WorkspaceChatSession): WorkspaceChatSummary {
  const firstUser = session.messages.find((m) => m.role === "user");
  const last = session.messages[session.messages.length - 1];
  const preview =
    last?.content.slice(0, 80) ?? firstUser?.content.slice(0, 80) ?? "";

  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    preview: preview.length > 80 ? `${preview.slice(0, 80)}…` : preview,
  };
}

export async function listWorkspaceChats(
  userId: string,
): Promise<WorkspaceChatSummary[]> {
  if (isSupabaseConfigured()) {
    try {
      const sessions = await sbChats.sbListWorkspaceChatSessions(userId);
      return sessions.map(toSummary);
    } catch (error) {
      console.error("[workspace-chats] supabase list", error);
      return [];
    }
  }

  const store = await readStore(userId);
  return store.sessions
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toSummary);
}

export async function getWorkspaceChat(
  userId: string,
  chatId: string,
): Promise<WorkspaceChatSession | null> {
  let session: WorkspaceChatSession | null = null;
  if (isSupabaseConfigured()) {
    try {
      session = await sbChats.sbGetWorkspaceChatSession(userId, chatId);
    } catch (error) {
      console.error("[workspace-chats] supabase get", error);
      return null;
    }
  } else {
    const store = await readStore(userId);
    session = store.sessions.find((s) => s.id === chatId) ?? null;
  }

  if (!session) return null;
  return {
    ...session,
    messages: sanitizeWorkspaceChatTurns(session.messages),
  };
}

export async function createWorkspaceChat(
  userId: string,
): Promise<WorkspaceChatSession> {
  const now = new Date().toISOString();
  const session: WorkspaceChatSession = {
    id: randomUUID(),
    title: "Новый чат",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };

  if (isSupabaseConfigured()) {
    try {
      await sbChats.sbInsertWorkspaceChatSession(userId, session);
      await sbChats.sbTrimWorkspaceChats(userId);
      return session;
    } catch (error) {
      console.error("[workspace-chats] supabase create", error);
      throw error;
    }
  }

  const store = await readStore(userId);
  store.sessions.unshift(session);
  await writeStore(userId, store);
  return session;
}

export async function updateWorkspaceChat(
  userId: string,
  chatId: string,
  messages: WorkspaceChatTurn[],
): Promise<WorkspaceChatSession | null> {
  const existing = await getWorkspaceChat(userId, chatId);
  if (!existing) return null;

  const firstUser = messages.find((m) => m.role === "user");
  const title =
    existing.title === "Новый чат" && firstUser
      ? makeTitle(firstUser.content)
      : existing.title;

  const updated: WorkspaceChatSession = {
    ...existing,
    title,
    messages: sanitizeWorkspaceChatTurns(messages),
    updatedAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    try {
      return await sbChats.sbUpdateWorkspaceChatSession(userId, updated);
    } catch (error) {
      console.error("[workspace-chats] supabase update", error);
      return null;
    }
  }

  const store = await readStore(userId);
  const index = store.sessions.findIndex((s) => s.id === chatId);
  if (index < 0) return null;
  store.sessions[index] = updated;
  await writeStore(userId, store);
  return updated;
}

export async function deleteWorkspaceChat(
  userId: string,
  chatId: string,
): Promise<boolean> {
  if (isSupabaseConfigured()) {
    try {
      return await sbChats.sbDeleteWorkspaceChatSession(userId, chatId);
    } catch (error) {
      console.error("[workspace-chats] supabase delete", error);
      return false;
    }
  }

  const store = await readStore(userId);
  const next = store.sessions.filter((s) => s.id !== chatId);
  if (next.length === store.sessions.length) return false;
  await writeStore(userId, { sessions: next });
  return true;
}
