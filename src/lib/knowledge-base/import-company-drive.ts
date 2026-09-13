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
  isImageMime,
} from "@/lib/google-drive/drive-content";
import {
  extractSpreadsheetText,
  isSpreadsheetFileName,
  isSpreadsheetMime,
} from "./spreadsheet-text";
import {
  ensureKnowledgeBaseBucket,
  kbStorageObjectPath,
  MAX_KB_FILE_BYTES,
  saveKnowledgeBaseFile,
} from "./asset-storage";
import { upsertImportedKnowledge } from "./service";
import { COMPANY_KB_LIBRARY_SLUG } from "./types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Top-level Drive folders to migrate into «База знаний для компании». */
export const COMPANY_DRIVE_ROOT_NAMES = [
  "Демо документы",
  "СПИОРА",
  "ЭМИГРАНТ",
] as const;

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesRootName(driveName: string, wanted: string): boolean {
  const a = normalizeName(driveName);
  const b = normalizeName(wanted);
  return a === b || a.includes(b) || b.includes(a);
}

async function driveGet<T>(path: string, token: string): Promise<T> {
  const res = await fetchWithTlsFallback(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DRIVE_HTTP_${res.status}`);
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
      fields: "nextPageToken,files(id,name,mimeType,size)",
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

async function downloadBinary(
  fileId: string,
  token: string,
): Promise<Buffer> {
  const res = await fetchWithTlsFallback(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`DRIVE_DOWNLOAD_${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function extractTextFromBuffer(
  file: DriveFile,
  buffer: Buffer,
): Promise<string> {
  if (isPdfMime(file.mimeType)) {
    return (await extractPdfText(buffer))?.trim() || "";
  }
  if (isPlainTextMime(file.mimeType)) {
    return extractPlainText(buffer) || "";
  }
  if (isSpreadsheetMime(file.mimeType) || isSpreadsheetFileName(file.name)) {
    try {
      return extractSpreadsheetText(buffer, file.name);
    } catch {
      return "";
    }
  }
  return "";
}

async function exportGoogleNativeText(
  file: DriveFile,
  token: string,
): Promise<string> {
  let exportMime = "";
  if (
    file.mimeType === "application/vnd.google-apps.document" ||
    file.mimeType === "application/vnd.google-apps.presentation"
  ) {
    exportMime = "text/plain";
  } else if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
    exportMime = "text/csv";
  }
  if (!exportMime) return "";
  const res = await fetchWithTlsFallback(
    `${DRIVE_API}/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(exportMime)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return "";
  return (await res.text()).trim();
}

function shouldStoreBinary(mimeType: string, name: string): boolean {
  if (mimeType.startsWith("application/vnd.google-apps.")) return false;
  if (isImageMime(mimeType) || isPdfMime(mimeType)) return true;
  if (isSpreadsheetMime(mimeType) || isSpreadsheetFileName(name)) return true;
  if (
    mimeType.includes("word") ||
    mimeType.includes("officedocument") ||
    /\.(docx?|pptx?|xlsx?|zip|rar)$/i.test(name)
  ) {
    return true;
  }
  // Store other binaries too (photos with odd mime, etc.)
  if (!isPlainTextMime(mimeType) && !mimeType.startsWith("text/")) return true;
  return false;
}

export async function importCompanyDriveFolders(options?: {
  dryRun?: boolean;
}): Promise<{
  dryRun: boolean;
  rootsFound: string[];
  missingRoots: string[];
  folders: number;
  articles: number;
  updated: number;
  filesStored: number;
  skippedLarge: number;
}> {
  if (!isGoogleDriveKbConfigured()) {
    throw new Error("DRIVE_NOT_CONFIGURED");
  }
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("DRIVE_AUTH_FAILED");

  const rootId = process.env.GOOGLE_DRIVE_KB_FOLDER_ID!.trim();
  const rootChildren = await listChildren(rootId, token);
  const rootsFound: string[] = [];
  const missingRoots: string[] = [];
  const rootFolders: DriveFile[] = [];

  for (const wanted of COMPANY_DRIVE_ROOT_NAMES) {
    const match = rootChildren.find(
      (child) =>
        child.mimeType === FOLDER_MIME && matchesRootName(child.name, wanted),
    );
    if (match) {
      rootsFound.push(match.name);
      rootFolders.push(match);
    } else {
      missingRoots.push(wanted);
    }
  }

  if (rootFolders.length === 0) {
    throw new Error("TARGET_FOLDERS_NOT_FOUND");
  }

  if (!options?.dryRun) {
    await ensureKnowledgeBaseBucket();
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
    kind?: "text" | "file";
    storagePath?: string | null;
    fileName?: string | null;
    sizeBytes?: number | null;
  }> = [];

  let filesStored = 0;
  let skippedLarge = 0;

  for (const root of rootFolders) {
    folders.push({
      sourceDriveId: root.id,
      parentSourceDriveId: null,
      name: root.name,
    });

    const queue = [root.id];
    const seen = new Set<string>();
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

        const size = Number(child.size || 0);
        if (size > MAX_KB_FILE_BYTES) {
          skippedLarge += 1;
          articles.push({
            sourceDriveId: child.id,
            parentSourceDriveId: currentId,
            title: child.name,
            body: `[Файл слишком большой для импорта (${Math.round(size / (1024 * 1024))} МБ): ${child.name}]`,
            sourceMimeType: child.mimeType,
            kind: "text",
          });
          continue;
        }

        if (options?.dryRun) {
          articles.push({
            sourceDriveId: child.id,
            parentSourceDriveId: currentId,
            title: child.name,
            body: "",
            sourceMimeType: child.mimeType,
            kind: shouldStoreBinary(child.mimeType, child.name) ? "file" : "text",
            fileName: child.name,
            sizeBytes: size || null,
          });
          continue;
        }

        let body = "";
        let storagePath: string | null = null;
        let kind: "text" | "file" = "text";
        let sizeBytes: number | null = size || null;

        if (child.mimeType.startsWith("application/vnd.google-apps.")) {
          body = await exportGoogleNativeText(child, token);
        } else {
          const buffer = await downloadBinary(child.id, token);
          sizeBytes = buffer.byteLength;
          body = await extractTextFromBuffer(child, buffer);

          if (shouldStoreBinary(child.mimeType, child.name)) {
            storagePath = kbStorageObjectPath(
              COMPANY_KB_LIBRARY_SLUG,
              `drive-${child.id}`,
              child.name,
            );
            await saveKnowledgeBaseFile(
              storagePath,
              buffer,
              child.mimeType || "application/octet-stream",
            );
            kind = "file";
            filesStored += 1;
          }
        }

        articles.push({
          sourceDriveId: child.id,
          parentSourceDriveId: currentId,
          title: child.name,
          body,
          sourceMimeType: child.mimeType,
          kind,
          storagePath,
          fileName: child.name,
          sizeBytes,
        });
      }
    }
  }

  if (options?.dryRun) {
    return {
      dryRun: true,
      rootsFound,
      missingRoots,
      folders: folders.length,
      articles: articles.length,
      updated: 0,
      filesStored: 0,
      skippedLarge,
    };
  }

  const result = await upsertImportedKnowledge({
    slug: "company_knowledge",
    folders,
    articles,
    updatedByName: "Company Drive import",
  });

  return {
    dryRun: false,
    rootsFound,
    missingRoots,
    folders: result.folders,
    articles: result.articles,
    updated: result.updated,
    filesStored,
    skippedLarge,
  };
}
