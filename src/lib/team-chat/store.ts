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
import {
  getTeamChatFileApiPath,
  MAX_TEAM_CHAT_FILE_BYTES,
  normalizeTeamChatFileContentType,
  saveTeamChatFile,
  deleteTeamChatFile,
  clearAllTeamChatFiles,
} from "./file-storage";
import type {
  CreateTeamChatMessageInput,
  CreateVoiceTeamChatMessageInput,
  TeamChatLinkItem,
  TeamChatMessage,
  TeamChatSharedMediaResult,
  TeamChatSharedMediaType,
} from "./types";
import {
  FILE_MESSAGE_SEARCH_LABEL,
  IMAGE_MESSAGE_SEARCH_LABEL,
  VOICE_MESSAGE_SEARCH_LABEL,
} from "./types";
import { buildMessagePreview } from "./message-preview";
import { linkifyText } from "./linkify";
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

function emptyMessageMediaFields() {
  return {
    audio_url: null as string | null,
    audio_duration_ms: null as number | null,
    image_url: null as string | null,
    file_url: null as string | null,
    file_name: null as string | null,
    file_content_type: null as string | null,
    file_size: null as number | null,
  };
}

function emptyReplyPinFields() {
  return {
    reply_to_message_id: null as string | null,
    reply_to_user_name: null as string | null,
    reply_to_message_type: null as TeamChatMessage["message_type"] | null,
    reply_to_preview: null as string | null,
    is_pinned: false,
    pinned_at: null as string | null,
    pinned_by_user_id: null as string | null,
  };
}

function normalizeTeamChatMessage(message: TeamChatMessage): TeamChatMessage {
  const messageType =
    message.message_type === "voice"
      ? "voice"
      : message.message_type === "image"
        ? "image"
        : message.message_type === "file"
          ? "file"
          : "text";
  return {
    ...message,
    message_type: messageType,
    ...emptyMessageMediaFields(),
    ...emptyReplyPinFields(),
    audio_url: message.audio_url ?? null,
    audio_duration_ms: message.audio_duration_ms ?? null,
    image_url: message.image_url ?? null,
    file_url: message.file_url ?? null,
    file_name: message.file_name ?? null,
    file_content_type: message.file_content_type ?? null,
    file_size: message.file_size ?? null,
    reply_to_message_id: message.reply_to_message_id ?? null,
    reply_to_user_name: message.reply_to_user_name ?? null,
    reply_to_message_type: message.reply_to_message_type ?? null,
    reply_to_preview: message.reply_to_preview ?? null,
    is_pinned: Boolean(message.is_pinned),
    pinned_at: message.pinned_at ?? null,
    pinned_by_user_id: message.pinned_by_user_id ?? null,
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

function validateCaption(text: string | undefined): string {
  const normalized = text?.trim() ?? "";
  if (!normalized) return "";
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    throw new Error("Caption too long");
  }
  return normalized;
}

async function applyReplyToMessage(
  message: TeamChatMessage,
  replyToId?: string,
): Promise<void> {
  if (!replyToId?.trim()) return;

  const parent = isSupabaseConfigured()
    ? await sbChat.sbGetTeamChatMessage(replyToId.trim())
    : (await readMessagesStore()).messages.find(
        (item) => item.id === replyToId.trim(),
      ) ?? null;

  if (!parent) {
    throw new Error("Reply message not found");
  }

  message.reply_to_message_id = parent.id;
  message.reply_to_user_name = parent.user_name;
  message.reply_to_message_type = parent.message_type;
  message.reply_to_preview = buildMessagePreview(parent);
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
            ? `${IMAGE_MESSAGE_SEARCH_LABEL} ${message.message_text}`.trim()
            : message.message_type === "file"
              ? `${FILE_MESSAGE_SEARCH_LABEL} ${message.file_name ?? ""} ${message.message_text}`.trim()
              : message.message_text.toLowerCase();
      const haystack = text.toLowerCase();
      const name = message.user_name.toLowerCase();
      return haystack.includes(q) || name.includes(q);
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
    ...emptyMessageMediaFields(),
    ...emptyReplyPinFields(),
    created_at: now,
    updated_at: now,
  };

  await applyReplyToMessage(message, input.replyToId);

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
    ...emptyMessageMediaFields(),
    ...emptyReplyPinFields(),
    audio_duration_ms: durationMs,
    created_at: now,
    updated_at: now,
  };
  message.audio_url = getTeamChatAudioApiPath(message.id);

  await applyReplyToMessage(message, input.replyToId);

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
  caption?: string,
  replyToId?: string,
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
    message_text: validateCaption(caption),
    ...emptyMessageMediaFields(),
    ...emptyReplyPinFields(),
    created_at: now,
    updated_at: now,
  };
  message.image_url = getTeamChatImageApiPath(message.id);

  await applyReplyToMessage(message, replyToId);

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

export async function createFileTeamChatMessage(
  user: SessionUser,
  fileBuffer: Buffer,
  fileName: string,
  contentType: string,
  caption?: string,
  replyToId?: string,
): Promise<TeamChatMessage> {
  const normalizedName = fileName.trim() || "file";
  const normalizedType = normalizeTeamChatFileContentType(
    contentType,
    normalizedName,
  );
  if (!normalizedType) {
    throw new Error("Invalid file type");
  }
  if (!fileBuffer.length) {
    throw new Error("Empty file");
  }
  if (fileBuffer.length > MAX_TEAM_CHAT_FILE_BYTES) {
    throw new Error("File too large");
  }

  const now = new Date().toISOString();
  const message: TeamChatMessage = {
    id: randomUUID(),
    user_id: user.id,
    user_name: user.name,
    user_role: user.role,
    message_type: "file",
    message_text: validateCaption(caption),
    ...emptyMessageMediaFields(),
    ...emptyReplyPinFields(),
    created_at: now,
    updated_at: now,
  };
  message.file_url = getTeamChatFileApiPath(message.id);
  message.file_name = normalizedName;
  message.file_content_type = normalizedType;
  message.file_size = fileBuffer.length;

  await applyReplyToMessage(message, replyToId);

  await saveTeamChatFile(message.id, normalizedName, fileBuffer, normalizedType);

  if (isSupabaseConfigured()) {
    try {
      return await sbChat.sbInsertTeamChatMessage(message);
    } catch (error) {
      await deleteTeamChatFile(message.id, normalizedName);
      console.error("[team-chat] supabase create file", error);
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
      if (ok && message.message_type === "file" && message.file_name) {
        await deleteTeamChatFile(id, message.file_name);
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
  if (message.message_type === "file" && message.file_name) {
    await deleteTeamChatFile(id, message.file_name);
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
      await clearAllTeamChatFiles();
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
  await clearAllTeamChatFiles();
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

export async function getTeamChatFileMeta(
  messageId: string,
): Promise<{ fileName: string; contentType: string } | null> {
  const store = await loadMessagesStore();
  const message = store.messages.find((item) => item.id === messageId);
  if (!message || message.message_type !== "file" || !message.file_name) {
    return null;
  }
  return {
    fileName: message.file_name,
    contentType: message.file_content_type ?? "application/octet-stream",
  };
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

export async function listPinnedTeamChatMessages(): Promise<TeamChatMessage[]> {
  const store = await loadMessagesStore();
  return store.messages
    .filter((message) => message.is_pinned)
    .sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? ""));
}

export async function setTeamChatMessagePinned(
  id: string,
  pinned: boolean,
  user: SessionUser,
): Promise<TeamChatMessage | null> {
  const store = await loadMessagesStore();
  const message = store.messages.find((item) => item.id === id);
  if (!message) return null;

  const now = new Date().toISOString();
  const nextPinned = pinned;
  const pinnedAt = nextPinned ? now : null;
  const pinnedBy = nextPinned ? user.id : null;

  if (isSupabaseConfigured()) {
    try {
      return await sbChat.sbUpdateTeamChatMessagePin(
        id,
        nextPinned,
        pinnedBy,
        pinnedAt,
        now,
      );
    } catch (error) {
      console.error("[team-chat] supabase pin", error);
      return null;
    }
  }

  message.is_pinned = nextPinned;
  message.pinned_at = pinnedAt;
  message.pinned_by_user_id = pinnedBy;
  message.updated_at = now;
  await writeMessagesStore(store);
  return message;
}

function collectMessageTextForLinks(message: TeamChatMessage): string {
  if (message.message_type === "text") {
    return message.message_text;
  }
  if (message.message_type === "image" || message.message_type === "file") {
    return message.message_text.trim();
  }
  return "";
}

function extractLinksFromMessages(messages: TeamChatMessage[]): TeamChatLinkItem[] {
  const links: TeamChatLinkItem[] = [];

  for (const message of messages) {
    const text = collectMessageTextForLinks(message);
    if (!text.trim()) continue;

    for (const part of linkifyText(text)) {
      if (part.type !== "link") continue;
      links.push({
        url: part.href,
        message_id: message.id,
        user_name: message.user_name,
        created_at: message.created_at,
        context: buildMessagePreview(message),
      });
    }
  }

  return links;
}

export async function listTeamChatSharedMedia(opts: {
  type: TeamChatSharedMediaType;
  limit: number;
  beforeCreatedAt?: string;
}): Promise<TeamChatSharedMediaResult> {
  const store = await loadMessagesStore();
  const limit = Math.max(1, Math.min(100, opts.limit));

  if (opts.type === "links") {
    let candidates = store.messages.filter((message) =>
      Boolean(collectMessageTextForLinks(message).trim()),
    );

    if (opts.beforeCreatedAt) {
      candidates = candidates.filter(
        (message) => message.created_at < opts.beforeCreatedAt!,
      );
    }

    candidates.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const links = extractLinksFromMessages(candidates).slice(0, limit);
    const hasMore =
      extractLinksFromMessages(candidates).length > links.length ||
      candidates.length > limit;

    return {
      type: "links",
      links,
      hasMore,
    };
  }

  let filtered = store.messages.filter(
    (message) => message.message_type === opts.type,
  );

  if (opts.beforeCreatedAt) {
    filtered = filtered.filter(
      (message) => message.created_at < opts.beforeCreatedAt!,
    );
  }

  filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const slice = filtered.slice(0, limit);

  return {
    type: opts.type,
    messages: slice,
    hasMore: filtered.length > slice.length,
  };
}
