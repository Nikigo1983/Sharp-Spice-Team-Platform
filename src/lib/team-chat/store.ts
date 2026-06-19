import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/auth/types";
import {
  getTeamChatAudioApiPath,
  MAX_TEAM_CHAT_AUDIO_BYTES,
  normalizeTeamChatAudioContentType,
  saveTeamChatAudio,
  deleteTeamChatAudio,
  clearAllTeamChatAudio,
} from "./audio-storage";
import {
  getTeamChatImageApiPath,
  MAX_TEAM_CHAT_IMAGE_BYTES,
  normalizeTeamChatImageContentType,
  saveTeamChatImage,
  deleteTeamChatImage,
  clearAllTeamChatImages,
} from "./image-storage";
import type {
  CreateTeamChatMessageInput,
  CreateVoiceTeamChatMessageInput,
  TeamChatMessage,
} from "./types";
import { IMAGE_MESSAGE_SEARCH_LABEL, VOICE_MESSAGE_SEARCH_LABEL } from "./types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbChat from "@/lib/supabase/team-chat-repo";

const STORE_PATH = path.join(process.cwd(), ".data", "team-chat-messages.json");
const LAST_SEEN_PATH = path.join(
  process.cwd(),
  ".data",
  "team-chat-last-seen.json",
);

type TeamChatStore = {
  messages: TeamChatMessage[];
};

type LastSeenStore = {
  users: Record<string, { lastSeenAt: string }>;
};

const MAX_MESSAGE_LENGTH = 5000;

async function loadMessagesStore(): Promise<TeamChatStore> {
  if (isSupabaseConfigured()) {
    try {
      return { messages: await sbChat.sbListAllTeamChatMessages() };
    } catch (error) {
      console.error("[team-chat] supabase load", error);
      return { messages: [] };
    }
  }
  return readMessagesStore();
}

function normalizeTeamChatMessage(message: TeamChatMessage): TeamChatMessage {
  const messageType =
    message.message_type === "voice"
      ? "voice"
      : message.message_type === "image"
        ? "image"
        : "text";
  return {
    ...message,
    message_type: messageType,
    audio_url: message.audio_url ?? null,
    audio_duration_ms: message.audio_duration_ms ?? null,
    image_url: message.image_url ?? null,
  };
}

async function readMessagesStore(): Promise<TeamChatStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as TeamChatStore;
    if (!Array.isArray(data.messages)) return { messages: [] };
    return {
      messages: data.messages.map((message) =>
        normalizeTeamChatMessage(message),
      ),
    };
  } catch {
    return { messages: [] };
  }
}

async function writeMessagesStore(store: TeamChatStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  store.messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function readLastSeenStore(): Promise<LastSeenStore> {
  try {
    const raw = await readFile(LAST_SEEN_PATH, "utf8");
    const data = JSON.parse(raw) as LastSeenStore;
    if (!data?.users || typeof data.users !== "object") return { users: {} };
    return data;
  } catch {
    return { users: {} };
  }
}

async function writeLastSeenStore(store: LastSeenStore): Promise<void> {
  await mkdir(path.dirname(LAST_SEEN_PATH), { recursive: true });
  await writeFile(LAST_SEEN_PATH, JSON.stringify(store, null, 2), "utf8");
}

function validateText(text: string): string | null {
  const normalized = text.trim();
  if (!normalized) return null;
  if (normalized.length > MAX_MESSAGE_LENGTH) return null;
  return normalized;
}

export async function listTeamChatMessages(opts: {
  limit: number;
  beforeCreatedAt?: string;
  afterCreatedAt?: string;
  q?: string;
}): Promise<{
  messages: TeamChatMessage[];
  hasMoreBefore: boolean;
  latestCreatedAt: string | null;
}> {
  const store = await loadMessagesStore();
  const limit = Math.max(1, Math.min(100, opts.limit));

  const latestCreatedAt =
    store.messages.length > 0
      ? store.messages[store.messages.length - 1].created_at
      : null;

  let filtered = store.messages;

  if (opts.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    filtered = filtered.filter((message) => {
      const text =
        message.message_type === "voice"
          ? VOICE_MESSAGE_SEARCH_LABEL
          : message.message_type === "image"
            ? IMAGE_MESSAGE_SEARCH_LABEL
            : message.message_text.toLowerCase();
      const name = message.user_name.toLowerCase();
      return text.includes(q) || name.includes(q);
    });
  } else if (opts.beforeCreatedAt) {
    const beforeCreatedAt = opts.beforeCreatedAt;
    filtered = filtered.filter(
      (message) => message.created_at < beforeCreatedAt,
    );
  } else if (opts.afterCreatedAt) {
    const afterCreatedAt = opts.afterCreatedAt;
    filtered = filtered.filter(
      (message) => message.created_at > afterCreatedAt,
    );
  }

  filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (opts.beforeCreatedAt && !opts.q?.trim()) {
    const slice = filtered.slice(-limit);
    return {
      messages: slice,
      hasMoreBefore: filtered.length > slice.length,
      latestCreatedAt,
    };
  }

  if (opts.afterCreatedAt && !opts.q?.trim()) {
    return {
      messages: filtered.slice(0, limit),
      hasMoreBefore: false,
      latestCreatedAt,
    };
  }

  const slice = filtered.slice(-limit);
  const hasMoreBefore =
    !opts.beforeCreatedAt && !opts.afterCreatedAt && !opts.q?.trim()
      ? store.messages.length > slice.length
      : false;

  return {
    messages: slice,
    hasMoreBefore,
    latestCreatedAt,
  };
}

export async function createTeamChatMessage(
  input: CreateTeamChatMessageInput,
  user: SessionUser,
): Promise<TeamChatMessage> {
  const text = validateText(input.text);
  if (!text) {
    throw new Error("Invalid message text");
  }

  const now = new Date().toISOString();
  const message: TeamChatMessage = {
    id: randomUUID(),
    user_id: user.id,
    user_name: user.name,
    user_role: user.role,
    message_type: "text",
    message_text: text,
    audio_url: null,
    audio_duration_ms: null,
    image_url: null,
    created_at: now,
    updated_at: now,
  };

  if (isSupabaseConfigured()) {
    try {
      return await sbChat.sbInsertTeamChatMessage(message);
    } catch (error) {
      console.error("[team-chat] supabase create", error);
      throw error;
    }
  }

  const store = await readMessagesStore();
  store.messages.push(message);
  await writeMessagesStore(store);
  return message;
}

export async function createVoiceTeamChatMessage(
  input: CreateVoiceTeamChatMessageInput,
  user: SessionUser,
  audioBuffer: Buffer,
  contentType: string,
): Promise<TeamChatMessage> {
  const normalizedType = normalizeTeamChatAudioContentType(contentType);
  if (!normalizedType) {
    throw new Error("Invalid audio type");
  }
  if (!audioBuffer.length) {
    throw new Error("Empty audio");
  }
  if (audioBuffer.length > MAX_TEAM_CHAT_AUDIO_BYTES) {
    throw new Error("Audio too large");
  }

  const durationMs = Math.max(0, Math.round(input.durationMs));
  const now = new Date().toISOString();
  const message: TeamChatMessage = {
    id: randomUUID(),
    user_id: user.id,
    user_name: user.name,
    user_role: user.role,
    message_type: "voice",
    message_text: "",
    audio_url: null,
    audio_duration_ms: durationMs,
    image_url: null,
    created_at: now,
    updated_at: now,
  };
  message.audio_url = getTeamChatAudioApiPath(message.id);

  await saveTeamChatAudio(message.id, audioBuffer, normalizedType);

  if (isSupabaseConfigured()) {
    try {
      return await sbChat.sbInsertTeamChatMessage(message);
    } catch (error) {
      await deleteTeamChatAudio(message.id);
      console.error("[team-chat] supabase create voice", error);
      throw error;
    }
  }

  const store = await readMessagesStore();
  store.messages.push(message);
  await writeMessagesStore(store);
  return message;
}

export async function createImageTeamChatMessage(
  user: SessionUser,
  imageBuffer: Buffer,
  contentType: string,
): Promise<TeamChatMessage> {
  const normalizedType = normalizeTeamChatImageContentType(contentType);
  if (!normalizedType) {
    throw new Error("Invalid image type");
  }
  if (!imageBuffer.length) {
    throw new Error("Empty image");
  }
  if (imageBuffer.length > MAX_TEAM_CHAT_IMAGE_BYTES) {
    throw new Error("Image too large");
  }

  const now = new Date().toISOString();
  const message: TeamChatMessage = {
    id: randomUUID(),
    user_id: user.id,
    user_name: user.name,
    user_role: user.role,
    message_type: "image",
    message_text: "",
    audio_url: null,
    audio_duration_ms: null,
    image_url: null,
    created_at: now,
    updated_at: now,
  };
  message.image_url = getTeamChatImageApiPath(message.id);

  await saveTeamChatImage(message.id, imageBuffer, normalizedType);

  if (isSupabaseConfigured()) {
    try {
      return await sbChat.sbInsertTeamChatMessage(message);
    } catch (error) {
      await deleteTeamChatImage(message.id);
      console.error("[team-chat] supabase create image", error);
      throw error;
    }
  }

  const store = await readMessagesStore();
  store.messages.push(message);
  await writeMessagesStore(store);
  return message;
}

export function canDeleteTeamChatMessage(
  message: TeamChatMessage,
  user: SessionUser,
): boolean {
  return user.role === "owner" || message.user_id === user.id;
}

export async function deleteTeamChatMessage(
  id: string,
  user: SessionUser,
): Promise<boolean> {
  const store = await loadMessagesStore();
  const message = store.messages.find((item) => item.id === id);
  if (!message) return false;
  if (!canDeleteTeamChatMessage(message, user)) return false;

  if (isSupabaseConfigured()) {
    try {
      const ok = await sbChat.sbDeleteTeamChatMessage(id);
      if (ok && message.message_type === "voice") {
        await deleteTeamChatAudio(id);
      }
      if (ok && message.message_type === "image") {
        await deleteTeamChatImage(id);
      }
      return ok;
    } catch (error) {
      console.error("[team-chat] supabase delete", error);
      return false;
    }
  }

  const fileStore = await readMessagesStore();
  fileStore.messages = fileStore.messages.filter((item) => item.id !== id);
  await writeMessagesStore(fileStore);
  if (message.message_type === "voice") {
    await deleteTeamChatAudio(id);
  }
  if (message.message_type === "image") {
    await deleteTeamChatImage(id);
  }
  return true;
}

export async function clearTeamChat(user: SessionUser): Promise<boolean> {
  if (user.role !== "owner") return false;

  if (isSupabaseConfigured()) {
    try {
      await sbChat.sbClearTeamChatMessages();
      await clearAllTeamChatAudio();
      await clearAllTeamChatImages();
      return true;
    } catch (error) {
      console.error("[team-chat] supabase clear", error);
      return false;
    }
  }

  const store = await readMessagesStore();
  store.messages = [];
  await writeMessagesStore(store);
  await clearAllTeamChatAudio();
  await clearAllTeamChatImages();
  return true;
}

export async function markTeamChatSeen(userId: string): Promise<string | null> {
  const store = await loadMessagesStore();
  const latestCreatedAt =
    store.messages.length > 0
      ? store.messages[store.messages.length - 1].created_at
      : new Date().toISOString();

  if (isSupabaseConfigured()) {
    try {
      await sbChat.sbSetTeamChatLastSeen(userId, latestCreatedAt);
      return latestCreatedAt;
    } catch (error) {
      console.error("[team-chat] supabase last seen", error);
      return latestCreatedAt;
    }
  }

  const lastSeen = await readLastSeenStore();
  lastSeen.users[userId] = { lastSeenAt: latestCreatedAt };
  await writeLastSeenStore(lastSeen);
  return latestCreatedAt;
}

export async function getTeamChatUnreadCount(userId: string): Promise<number> {
  if (isSupabaseConfigured()) {
    try {
      const lastSeenAt = await sbChat.sbGetTeamChatLastSeen(userId);
      if (!lastSeenAt) return 0;
      const store = await loadMessagesStore();
      return store.messages.filter(
        (message) => message.created_at > lastSeenAt,
      ).length;
    } catch (error) {
      console.error("[team-chat] supabase unread", error);
      return 0;
    }
  }

  const lastSeen = await readLastSeenStore();
  const entry = lastSeen.users[userId];
  if (!entry) return 0;

  const store = await loadMessagesStore();
  return store.messages.filter(
    (message) => message.created_at > entry.lastSeenAt,
  ).length;
}

export async function listLatestTeamChatForDashboard(
  limit: number,
): Promise<TeamChatMessage[]> {
  const store = await loadMessagesStore();
  const safeLimit = Math.max(1, Math.min(20, limit));
  return store.messages
    .slice(-safeLimit)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
