import "server-only";

import { fetchWithTlsFallback } from "@/lib/google-fetch";
import {
  getGoogleAccessToken,
  isGoogleDriveKbConfigured,
} from "@/lib/google-sheets/auth";
import {
  extractPdfText,
  extractPlainText,
  isPdfMime,
  isPlainTextMime,
} from "@/lib/google-drive/drive-content";
import { upsertImportedKnowledge } from "./service";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const TARGET_FOLDER_NAME = "Immigration_Knowledge_Base";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  size?: string;
};

async function driveGet<T>(path: string, token: string): Promise<T> {
  const res = await fetchWithTlsFallback(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`DRIVE_HTTP_${res.status}`);
  }
  return (await res.json()) as T;
}

async function listChildren(
  folderId: string,
  token: string,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,parents,size)",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await driveGet<{
      files?: DriveFile[];
      nextPageToken?: string;
    }>(`/files?${params}`, token);
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return files;
}

async function findTargetFolderId(
  rootId: string,
  token: string,
): Promise<string | null> {
  const rootMeta = await driveGet<DriveFile>(
    `/files/${encodeURIComponent(rootId)}?fields=id,name,mimeType&supportsAllDrives=true`,
    token,
  );
  if (rootMeta.name === TARGET_FOLDER_NAME) return rootMeta.id;

  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const children = await listChildren(id, token);
    for (const child of children) {
      if (child.mimeType !== FOLDER_MIME) continue;
      if (child.name === TARGET_FOLDER_NAME) return child.id;
      queue.push(child.id);
    }
    if (seen.size > 2000) break;
  }
  return null;
}

async function extractFileText(
  file: DriveFile,
  token: string,
): Promise<string> {
  if (
    file.mimeType === "application/vnd.google-apps.document" ||
    file.mimeType === "application/vnd.google-apps.presentation"
  ) {
    const res = await fetchWithTlsFallback(
      `${DRIVE_API}/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent("text/plain")}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return "";
    return (await res.text()).trim();
  }

  if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
    const res = await fetchWithTlsFallback(
      `${DRIVE_API}/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent("text/csv")}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return "";
    return (await res.text()).trim();
  }

  if (isPdfMime(file.mimeType) || isPlainTextMime(file.mimeType)) {
    if (Number(file.size || 0) > 8 * 1024 * 1024) {
      return `[Файл слишком большой для импорта текста: ${file.name}]`;
    }
    const res = await fetchWithTlsFallback(
      `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return "";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (isPdfMime(file.mimeType)) {
      return (await extractPdfText(buffer))?.trim() || "";
    }
    return extractPlainText(buffer) || "";
  }

  return `[Тип файла не извлечён автоматически: ${file.mimeType}. Исходное имя: ${file.name}]`;
}

export async function importImmigrationKnowledgeBase(options?: {
  dryRun?: boolean;
}): Promise<{
  dryRun: boolean;
  targetFolderId: string | null;
  folders: number;
  articles: number;
  updated: number;
  skippedEmpty: number;
}> {
  if (!isGoogleDriveKbConfigured()) {
    throw new Error("DRIVE_NOT_CONFIGURED");
  }
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("DRIVE_AUTH_FAILED");

  const rootId = process.env.GOOGLE_DRIVE_KB_FOLDER_ID!.trim();
  const overrideId = process.env.GOOGLE_DRIVE_KB_MIGRATE_FOLDER_ID?.trim();
  const targetId =
    overrideId || (await findTargetFolderId(rootId, token));
  if (!targetId) {
    throw new Error("TARGET_FOLDER_NOT_FOUND");
  }

  const folders: Array<{
    sourceDriveId: string;
    parentSourceDriveId: string | null;
    name: string;
  }> = [];
  const articles: Array<{
    sourceDriveId: string;
    parentSourceDriveId: string | null;
    title: string;
    body: string;
    sourceMimeType: string | null;
  }> = [];

  // Root imported folder becomes a top-level platform folder
  folders.push({
    sourceDriveId: targetId,
    parentSourceDriveId: null,
    name: TARGET_FOLDER_NAME,
  });

  const queue = [targetId];
  const seen = new Set<string>();
  let skippedEmpty = 0;

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (seen.has(currentId)) continue;
    seen.add(currentId);
    const children = await listChildren(currentId, token);
    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) {
        folders.push({
          sourceDriveId: child.id,
          parentSourceDriveId: currentId,
          name: child.name,
        });
        queue.push(child.id);
        continue;
      }

      const body = await extractFileText(child, token);
      if (!body.trim()) {
        skippedEmpty += 1;
        // Still create a placeholder so managers see the file existed
        articles.push({
          sourceDriveId: child.id,
          parentSourceDriveId: currentId,
          title: child.name,
          body: "",
          sourceMimeType: child.mimeType,
        });
        continue;
      }

      articles.push({
        sourceDriveId: child.id,
        parentSourceDriveId: currentId,
        title: child.name,
        body,
        sourceMimeType: child.mimeType,
      });
    }
  }

  if (options?.dryRun) {
    return {
      dryRun: true,
      targetFolderId: targetId,
      folders: folders.length,
      articles: articles.length,
      updated: 0,
      skippedEmpty,
    };
  }

  const result = await upsertImportedKnowledge({
    folders,
    articles,
    updatedByName: "Drive import",
  });

  return {
    dryRun: false,
    targetFolderId: targetId,
    folders: result.folders,
    articles: result.articles,
    updated: result.updated,
    skippedEmpty,
  };
}
