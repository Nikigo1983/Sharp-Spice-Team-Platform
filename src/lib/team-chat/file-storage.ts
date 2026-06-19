import "server-only";

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  contentTypeFromExt,
  extFromFileName,
  normalizeTaskAttachmentContentType,
} from "@/lib/tasks/attachment-formats";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const BUCKET = "team-chat-files";
const LOCAL_DIR = path.join(process.cwd(), ".data", "team-chat-files");

export const MAX_TEAM_CHAT_FILE_BYTES = 25 * 1024 * 1024;

function storageFileName(messageId: string, ext: string): string {
  return `${messageId}.${ext || "bin"}`;
}

export function getTeamChatFileApiPath(messageId: string): string {
  return `/api/team-chat/file/${encodeURIComponent(messageId)}`;
}

export function normalizeTeamChatFileContentType(
  contentType: string,
  fileName: string,
): string {
  return normalizeTaskAttachmentContentType(contentType, fileName);
}

export async function saveTeamChatFile(
  messageId: string,
  fileName: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const ext = extFromFileName(fileName) || "bin";
  const storageName = storageFileName(messageId, ext);

  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin()
      .storage.from(BUCKET)
      .upload(storageName, data, {
        contentType,
        upsert: true,
      });
    if (error) throw error;
    return;
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, storageName), data);
}

export async function readTeamChatFile(
  messageId: string,
  fileName: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const ext = extFromFileName(fileName) || "bin";
  const storageName = storageFileName(messageId, ext);

  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(BUCKET)
      .download(storageName);
    if (!error && data) {
      return {
        data: Buffer.from(await data.arrayBuffer()),
        contentType: contentTypeFromExt(ext),
      };
    }
    return null;
  }

  try {
    const filePath = path.join(LOCAL_DIR, storageName);
    const data = await readFile(filePath);
    return { data, contentType: contentTypeFromExt(ext) };
  } catch {
    return null;
  }
}

export async function deleteTeamChatFile(messageId: string, fileName: string): Promise<void> {
  const ext = extFromFileName(fileName) || "bin";
  const storageName = storageFileName(messageId, ext);

  if (isSupabaseConfigured()) {
    await getSupabaseAdmin().storage.from(BUCKET).remove([storageName]);
    return;
  }

  try {
    await unlink(path.join(LOCAL_DIR, storageName));
  } catch {
    // ignore missing file
  }
}

export async function clearAllTeamChatFiles(): Promise<void> {
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
