import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const KB_STORAGE_BUCKET = "knowledge-base";
const LOCAL_DIR = path.join(process.cwd(), ".data", "knowledge-base");
export const MAX_KB_FILE_BYTES = 40 * 1024 * 1024;

function safeExt(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match?.[1]?.toLowerCase() || "bin";
}

export function kbStorageObjectPath(
  librarySlug: string,
  articleId: string,
  fileName: string,
): string {
  return `${librarySlug}/${articleId}.${safeExt(fileName)}`;
}

export async function ensureKnowledgeBaseBucket(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabaseAdmin();
  const { data: buckets } = await sb.storage.listBuckets();
  if (buckets?.some((b) => b.id === KB_STORAGE_BUCKET || b.name === KB_STORAGE_BUCKET)) {
    return;
  }
  const { error } = await sb.storage.createBucket(KB_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_KB_FILE_BYTES,
  });
  // Ignore race if bucket already exists
  if (error && !/already exists|duplicate/i.test(error.message)) {
    console.error("[knowledge-base] createBucket", error.message);
  }
}

export async function saveKnowledgeBaseFile(
  storagePath: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  if (isSupabaseConfigured()) {
    await ensureKnowledgeBaseBucket();
    const { error } = await getSupabaseAdmin()
      .storage.from(KB_STORAGE_BUCKET)
      .upload(storagePath, data, {
        contentType: contentType || "application/octet-stream",
        upsert: true,
      });
    if (error) throw error;
    return;
  }

  const full = path.join(LOCAL_DIR, storagePath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function readKnowledgeBaseFile(
  storagePath: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(KB_STORAGE_BUCKET)
      .download(storagePath);
    if (error || !data) return null;
    return {
      data: Buffer.from(await data.arrayBuffer()),
      contentType: "application/octet-stream",
    };
  }

  try {
    const data = await readFile(path.join(LOCAL_DIR, storagePath));
    return { data, contentType: "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function deleteKnowledgeBaseFile(
  storagePath: string,
): Promise<void> {
  if (isSupabaseConfigured()) {
    await getSupabaseAdmin().storage.from(KB_STORAGE_BUCKET).remove([storagePath]);
    return;
  }
  try {
    await unlink(path.join(LOCAL_DIR, storagePath));
  } catch {
    // ignore
  }
}
