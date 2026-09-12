import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  contentTypeFromExt,
  extFromFileName,
} from "@/lib/clients/document-formats";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const BUCKET = "client-documents";
const LOCAL_DIR = path.join(process.cwd(), ".data", "client-documents");

function storageFileName(documentId: string, ext: string): string {
  return `${documentId}.${ext}`;
}

export async function saveClientDocumentFile(
  documentId: string,
  fileName: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const ext = extFromFileName(fileName) || "bin";
  const storageName = storageFileName(documentId, ext);

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

export async function readClientDocumentFile(
  documentId: string,
  fileName: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const ext = extFromFileName(fileName) || "bin";
  const storageName = storageFileName(documentId, ext);

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

export async function deleteClientDocumentFile(
  documentId: string,
  fileName: string,
): Promise<void> {
  const ext = extFromFileName(fileName) || "bin";
  const storageName = storageFileName(documentId, ext);

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
