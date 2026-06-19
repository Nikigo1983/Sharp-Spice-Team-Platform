import "server-only";

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const BUCKET = "team-chat-images";
const LOCAL_DIR = path.join(process.cwd(), ".data", "team-chat-images");
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"] as const;

export const MAX_TEAM_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_TEAM_CHAT_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

function extFromContentType(contentType: string): string {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("webp")) return "webp";
  return "jpg";
}

function storageFileName(messageId: string, ext: string): string {
  return `${messageId}.${ext}`;
}

function contentTypeFromExt(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export function getTeamChatImageApiPath(messageId: string): string {
  return `/api/team-chat/image/${encodeURIComponent(messageId)}`;
}

export function normalizeTeamChatImageContentType(contentType: string): string {
  const base = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (ALLOWED_TEAM_CHAT_IMAGE_TYPES.has(base)) return base;
  return "";
}

export async function saveTeamChatImage(
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
        contentType: normalizeTeamChatImageContentType(contentType) || contentType,
        upsert: true,
      });
    if (error) throw error;
    return;
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, fileName), data);
}

export async function readTeamChatImage(messageId: string): Promise<{
  data: Buffer;
  contentType: string;
} | null> {
  if (isSupabaseConfigured()) {
    for (const ext of IMAGE_EXTENSIONS) {
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

  for (const ext of IMAGE_EXTENSIONS) {
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

export async function deleteTeamChatImage(messageId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const paths = IMAGE_EXTENSIONS.map((ext) =>
      storageFileName(messageId, ext),
    );
    await getSupabaseAdmin().storage.from(BUCKET).remove(paths);
    return;
  }

  for (const ext of IMAGE_EXTENSIONS) {
    try {
      await unlink(path.join(LOCAL_DIR, storageFileName(messageId, ext)));
    } catch {
      // ignore missing file
    }
  }
}

export async function clearAllTeamChatImages(): Promise<void> {
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
