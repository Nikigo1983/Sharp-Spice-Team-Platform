import "server-only";

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { contentTypeFromExt, extFromFileName } from "@/lib/tasks/attachment-formats";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const BUCKET = "task-attachments";
const LOCAL_DIR = path.join(process.cwd(), ".data", "task-attachments");

function storageFileName(attachmentId: string, ext: string): string {
  return `${attachmentId}.${ext}`;
}

export async function saveTaskAttachmentFile(
  attachmentId: string,
  fileName: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const ext = extFromFileName(fileName) || "bin";
  const storageName = storageFileName(attachmentId, ext);

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

export async function readTaskAttachmentFile(
  attachmentId: string,
  fileName: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const ext = extFromFileName(fileName) || "bin";
  const storageName = storageFileName(attachmentId, ext);

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

export async function deleteTaskAttachmentFile(
  attachmentId: string,
  fileName: string,
): Promise<void> {
  const ext = extFromFileName(fileName) || "bin";
  const storageName = storageFileName(attachmentId, ext);

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

export async function clearAllTaskAttachmentFiles(): Promise<void> {
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
