import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAppState, setAppState } from "@/lib/supabase/app-state";
import {
  emptyConversationMemory,
  normalizeConversationMemoryState,
  type ConversationMemoryState,
} from "@/lib/ai/workspace-conversation-memory";

const STORE_PATH = path.join(
  process.cwd(),
  ".data",
  "ai-workspace-chat-memory.json",
);
const APP_STATE_KEY = "ai_workspace_chat_memory";

type MemoryStore = {
  users: Record<string, Record<string, ConversationMemoryState>>;
};

async function readFileStore(): Promise<MemoryStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as MemoryStore;
    if (!data.users || typeof data.users !== "object") return { users: {} };
    return data;
  } catch {
    return { users: {} };
  }
}

async function writeFileStore(store: MemoryStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function readStore(): Promise<MemoryStore> {
  if (isSupabaseConfigured()) {
    try {
      const remote = await getAppState<MemoryStore>(APP_STATE_KEY);
      if (remote?.users) return remote;
    } catch (error) {
      console.error("[workspace-chat-memory] supabase read", error);
    }
  }
  return readFileStore();
}

async function writeStore(store: MemoryStore): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await setAppState(APP_STATE_KEY, store);
      return;
    } catch (error) {
      console.error("[workspace-chat-memory] supabase write", error);
    }
  }
  await writeFileStore(store);
}

export async function getWorkspaceChatMemory(
  userId: string,
  chatId: string,
): Promise<ConversationMemoryState> {
  const store = await readStore();
  const raw = store.users[userId]?.[chatId];
  return raw
    ? normalizeConversationMemoryState(raw)
    : emptyConversationMemory();
}

export async function setWorkspaceChatMemory(
  userId: string,
  chatId: string,
  memory: ConversationMemoryState,
): Promise<ConversationMemoryState> {
  const store = await readStore();
  const next = normalizeConversationMemoryState(memory);
  const userBucket = store.users[userId] ?? {};
  store.users[userId] = {
    ...userBucket,
    [chatId]: next,
  };
  await writeStore(store);
  return next;
}

export async function deleteWorkspaceChatMemory(
  userId: string,
  chatId: string,
): Promise<void> {
  const store = await readStore();
  const userBucket = store.users[userId];
  if (!userBucket?.[chatId]) return;
  const { [chatId]: _removed, ...rest } = userBucket;
  store.users[userId] = rest;
  await writeStore(store);
}

export async function patchWorkspaceChatMemory(
  userId: string,
  chatId: string,
  patch: Partial<ConversationMemoryState>,
): Promise<ConversationMemoryState> {
  const current = await getWorkspaceChatMemory(userId, chatId);
  return setWorkspaceChatMemory(userId, chatId, {
    ...current,
    ...patch,
  });
}
