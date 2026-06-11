import "server-only";

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const BUCKET = "team-chat-audio";
const LOCAL_DIR = path.join(process.cwd(), ".data", "team-chat-audio");
const AUDIO_EXTENSIONS = ["webm", "ogg", "m4a", "mp4"] as const;

export const MAX_TEAM_CHAT_AUDIO_BYTES = 15 * 1024 * 1024;

export const ALLOWED_TEAM_CHAT_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/x-m4a",
]);

function extFromContentType(contentType: string): string {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  return "webm";
}

function storageFileName(messageId: string, ext: string): string {
  return `${messageId}.${ext}`;
}

function contentTypeFromExt(ext: string): string {
  if (ext === "ogg") return "audio/ogg";
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  return "audio/webm";
}

export function getTeamChatAudioApiPath(messageId: string): string {
  return `/api/team-chat/audio/${encodeURIComponent(messageId)}`;
}

export function normalizeTeamChatAudioContentType(contentType: string): string {
  const base = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (ALLOWED_TEAM_CHAT_AUDIO_TYPES.has(base)) return base;
  return "";
}

export async function saveTeamChatAudio(
  messageId: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const ext = extFromContentType(contentType);
  const fileName = storageFileName(messageId, ext);

  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin()
      .storage.from(BUCKET)
      .upload(fileName, data, {
        contentType: normalizeTeamChatAudioContentType(contentType) || contentType,
        upsert: true,
      });
    if (error) throw error;
    return;
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, fileName), data);
}

export async function readTeamChatAudio(messageId: string): Promise<{
  data: Buffer;
  contentType: string;
} | null> {
  if (isSupabaseConfigured()) {
    for (const ext of AUDIO_EXTENSIONS) {
      const fileName = storageFileName(messageId, ext);
      const { data, error } = await getSupabaseAdmin()
        .storage.from(BUCKET)
        .download(fileName);
      if (!error && data) {
        return {
          data: Buffer.from(await data.arrayBuffer()),
          contentType: contentTypeFromExt(ext),
        };
      }
    }
    return null;
  }

  for (const ext of AUDIO_EXTENSIONS) {
    try {
      const filePath = path.join(LOCAL_DIR, storageFileName(messageId, ext));
      const data = await readFile(filePath);
      return { data, contentType: contentTypeFromExt(ext) };
    } catch {
      // try next extension
    }
  }

  return null;
}

export async function deleteTeamChatAudio(messageId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const paths = AUDIO_EXTENSIONS.map((ext) =>
      storageFileName(messageId, ext),
    );
    await getSupabaseAdmin().storage.from(BUCKET).remove(paths);
    return;
  }

  for (const ext of AUDIO_EXTENSIONS) {
    try {
      await unlink(path.join(LOCAL_DIR, storageFileName(messageId, ext)));
    } catch {
      // ignore missing file
    }
  }
}

export async function clearAllTeamChatAudio(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      limit: 1000,
    });
    if (error) throw error;
    if (data?.length) {
      await supabase.storage.from(BUCKET).remove(data.map((file) => file.name));
    }
    return;
  }

  try {
    const files = await readdir(LOCAL_DIR);
    await Promise.all(
      files.map((file) =>
        unlink(path.join(LOCAL_DIR, file)).catch(() => undefined),
      ),
    );
  } catch {
    // directory may not exist yet
  }
}
