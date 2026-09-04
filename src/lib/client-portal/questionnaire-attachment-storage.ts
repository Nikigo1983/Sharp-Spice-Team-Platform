import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  contentTypeFromExt,
  extFromFileName,
} from "./questionnaire-attachment-formats";

const LOCAL_DIR = path.join(process.cwd(), ".data", "questionnaire-attachments");

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "user";
}

function storageObjectName(
  ownerKey: string,
  attachmentId: string,
  ext: string,
): string {
  return `${safeSegment(ownerKey)}/${attachmentId}.${ext}`;
}

export async function saveQuestionnaireAttachmentFile(
  ownerKey: string,
  attachmentId: string,
  fileName: string,
  data: Buffer,
): Promise<void> {
  const ext = extFromFileName(fileName) || "bin";
  const objectName = storageObjectName(ownerKey, attachmentId, ext);
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
  try {
    await unlink(path.join(LOCAL_DIR, objectName));
  } catch {
    // ignore missing
  }
}
