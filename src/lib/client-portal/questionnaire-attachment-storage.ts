import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  contentTypeFromExt,
  extFromFileName,
} from "./questionnaire-attachment-formats";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const BUCKET = "task-attachments";
const OBJECT_PREFIX = "client-portal";
const LOCAL_DIR = path.join(process.cwd(), ".data", "questionnaire-attachments");

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "user";
}

function storageObjectName(
  ownerKey: string,
  attachmentId: string,
  ext: string,
): string {
  return `${OBJECT_PREFIX}/${safeSegment(ownerKey)}/${attachmentId}.${ext}`;
}

export async function saveQuestionnaireAttachmentFile(
  ownerKey: string,
  attachmentId: string,
  fileName: string,
  data: Buffer,
  contentType?: string,
): Promise<void> {
  const ext = extFromFileName(fileName) || "bin";
  const objectName = storageObjectName(ownerKey, attachmentId, ext);

  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin()
      .storage.from(BUCKET)
      .upload(objectName, data, {
        contentType: contentType || contentTypeFromExt(ext),
        upsert: true,
      });
    if (error) throw error;
    return;
  }

  const fullPath = path.join(LOCAL_DIR, objectName);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, data);
}

export async function readQuestionnaireAttachmentFile(
  ownerKey: string,
  attachmentId: string,
  fileName: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const ext = extFromFileName(fileName) || "bin";
  const objectName = storageObjectName(ownerKey, attachmentId, ext);

  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(BUCKET)
      .download(objectName);
    if (!error && data) {
      return {
        data: Buffer.from(await data.arrayBuffer()),
        contentType: contentTypeFromExt(ext),
      };
    }
    return null;
  }

  try {
    const data = await readFile(path.join(LOCAL_DIR, objectName));
    return { data, contentType: contentTypeFromExt(ext) };
  } catch {
    return null;
  }
}

export async function deleteQuestionnaireAttachmentFile(
  ownerKey: string,
  attachmentId: string,
  fileName: string,
): Promise<void> {
  const ext = extFromFileName(fileName) || "bin";
  const objectName = storageObjectName(ownerKey, attachmentId, ext);

  if (isSupabaseConfigured()) {
    try {
      await getSupabaseAdmin().storage.from(BUCKET).remove([objectName]);
    } catch {
      // ignore
    }
    return;
  }

  try {
    await unlink(path.join(LOCAL_DIR, objectName));
  } catch {
    // ignore missing
  }
}
