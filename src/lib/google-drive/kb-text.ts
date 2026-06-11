import { fetchWithTlsFallback } from "@/lib/google-fetch";
import {
  getGoogleAccessToken,
  isGoogleDriveEmigrantConfigured,
  isGoogleDriveKbConfigured,
} from "@/lib/google-sheets/auth";
import { getCached, setCached } from "@/lib/google-sheets/cache";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_DOC = "application/vnd.google-apps.document";
const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDES = "application/vnd.google-apps.presentation";

const MAX_DEPTH = 6;
const MAX_FILES = 40;
const MAX_FILES_EMIGRANT = 60;
const MAX_FILES_FULL_EXPORT = 8;
const MAX_CHARS_PER_FILE = 4000;
const MAX_TOTAL_CHARS = 24_000;

type DriveFileNode = {
  id: string;
  name: string;
  mimeType: string;
  path: string;
};

type KbTextChunk = {
  path: string;
  name: string;
  mimeType: string;
  text: string;
};

async function driveGetText(url: string): Promise<string | null> {
  const token = await getGoogleAccessToken();
  if (!token) return null;

  try {
    const response = await fetchWithTlsFallback(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      console.error("[kb-text] fetch error", response.status, url.slice(0, 120));
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error("[kb-text] fetch failed", error);
    return null;
  }
}

async function driveListChildren(folderId: string): Promise<DriveFileNode[]> {
  const token = await getGoogleAccessToken();
  if (!token) return [];

  const q = `'${folderId}' in parents and trashed=false`;
  const path = `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&orderBy=folder,name&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  try {
    const response = await fetchWithTlsFallback(`${DRIVE_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      files?: Array<{ id: string; name: string; mimeType: string }>;
    };
    return (data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      path: "",
    }));
  } catch {
    return [];
  }
}

async function collectFiles(
  folderId: string,
  prefix: string,
  depth: number,
  acc: DriveFileNode[],
  maxFiles: number,
): Promise<void> {
  if (depth > MAX_DEPTH || acc.length >= maxFiles) return;

  const children = await driveListChildren(folderId);
  for (const child of children) {
    if (acc.length >= maxFiles) break;
    const path = prefix ? `${prefix}/${child.name}` : child.name;
    const node = { ...child, path };

    if (child.mimeType === FOLDER_MIME) {
      await collectFiles(child.id, path, depth + 1, acc, maxFiles);
    } else {
      acc.push(node);
    }
  }
}

function exportMimeFor(mimeType: string): string | null {
  if (mimeType === GOOGLE_DOC || mimeType === GOOGLE_SLIDES) {
    return "text/plain";
  }
  if (mimeType === GOOGLE_SHEET) return "text/csv";
  return null;
}

async function exportFileText(
  fileId: string,
  mimeType: string,
): Promise<string | null> {
  const exportMime = exportMimeFor(mimeType);
  if (!exportMime) return null;

  const url = `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
  return driveGetText(url);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [обрезано]`;
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}@.]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreChunk(chunk: KbTextChunk, tokens: string[]): number {
  const hay = `${chunk.path} ${chunk.name} ${chunk.text}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += 2;
  }
  return score;
}

async function fileToChunk(file: DriveFileNode): Promise<KbTextChunk> {
  const exportMime = exportMimeFor(file.mimeType);
  if (exportMime) {
    const raw = await exportFileText(file.id, file.mimeType);
    if (raw?.trim()) {
      return {
        path: file.path,
        name: file.name,
        mimeType: file.mimeType,
        text: truncate(raw.trim(), MAX_CHARS_PER_FILE),
      };
    }
  }

  const typeLabel = file.mimeType.includes("pdf") ? "PDF" : file.mimeType;
  return {
    path: file.path,
    name: file.name,
    mimeType: file.mimeType,
    text: `[Файл в Drive — текст не извлечён автоматически. Тип: ${typeLabel}. Откройте в Google Drive.]`,
  };
}

async function buildKbChunks(files: DriveFileNode[]): Promise<KbTextChunk[]> {
  const batchSize = 4;
  const chunks: KbTextChunk[] = [];

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const part = await Promise.all(batch.map(fileToChunk));
    chunks.push(...part);
  }

  return chunks;
}

function formatDriveContext(
  folderLabel: string,
  chunks: KbTextChunk[],
  query: string,
): string {
  if (chunks.length === 0) {
    return `${folderLabel}: файлы не найдены или нет доступа к папке.`;
  }

  const tokens = tokenizeQuery(query);
  const ranked = [...chunks].sort(
    (a, b) => scoreChunk(b, tokens) - scoreChunk(a, tokens),
  );

  const selected =
    tokens.length === 0
      ? ranked
      : ranked.filter((c) => scoreChunk(c, tokens) > 0).length > 0
        ? ranked.filter((c) => scoreChunk(c, tokens) > 0)
        : ranked.slice(0, 12);

  const limited = selected.slice(0, 18);
  let total = 0;
  const parts: string[] = [
    `${folderLabel} (Google Drive): ${chunks.length} файлов, в ответ включено ${limited.length}.`,
  ];

  for (const chunk of limited) {
    const block = `### ${chunk.path}\n${chunk.text}`;
    if (total + block.length > MAX_TOTAL_CHARS) {
      parts.push("… [остальные файлы опущены из‑за лимита контекста]");
      break;
    }
    parts.push(block);
    total += block.length;
  }

  return parts.join("\n\n");
}

async function getDriveFileList(
  folderId: string,
  cacheKey: string,
  maxFiles: number,
): Promise<DriveFileNode[]> {
  const cached = getCached<DriveFileNode[]>(cacheKey);
  if (cached) return cached;

  const files: DriveFileNode[] = [];
  await collectFiles(folderId, "", 0, files, maxFiles);
  setCached(cacheKey, files, 30 * 60_000);
  return files;
}

function scoreFile(file: DriveFileNode, tokens: string[]): number {
  const hay = `${file.path} ${file.name}`.toLowerCase();
  return tokens.reduce((s, t) => (hay.includes(t) ? s + 2 : s), 0);
}

async function getDriveCatalogForAi(
  folderId: string,
  folderLabel: string,
  cacheKey: string,
  maxFiles: number,
  userQuery: string,
): Promise<string> {
  const files = await getDriveFileList(folderId, cacheKey, maxFiles);
  if (files.length === 0) {
    return `${folderLabel}: файлы не найдены.`;
  }

  const tokens = tokenizeQuery(userQuery);
  const ranked = [...files].sort(
    (a, b) => scoreFile(b, tokens) - scoreFile(a, tokens),
  );
  const picked = (tokens.length > 0
    ? ranked.filter((f) => scoreFile(f, tokens) > 0)
    : ranked
  ).slice(0, 25);

  const lines = picked.map((f) => {
    const type = f.mimeType.includes("pdf")
      ? "PDF"
      : f.mimeType.split("/").pop() ?? "file";
    return `- ${f.path} (${type})`;
  });
  return `${folderLabel} — список файлов (${files.length} всего, показано ${lines.length}):\n${lines.join("\n")}`;
}

async function getDriveTextForAi(
  folderId: string,
  folderLabel: string,
  cachePrefix: string,
  maxFiles: number,
  userQuery: string,
  options?: { full?: boolean },
): Promise<string> {
  if (!options?.full) {
    return getDriveCatalogForAi(
      folderId,
      folderLabel,
      `${cachePrefix}:files`,
      maxFiles,
      userQuery,
    );
  }

  const files = await getDriveFileList(
    folderId,
    `${cachePrefix}:files`,
    maxFiles,
  );
  const tokens = tokenizeQuery(userQuery);
  const ranked = [...files].sort(
    (a, b) => scoreFile(b, tokens) - scoreFile(a, tokens),
  );
  const toExport = (
    tokens.length > 0
      ? ranked.filter((f) => scoreFile(f, tokens) > 0)
      : ranked
  ).slice(0, MAX_FILES_FULL_EXPORT);

  const cacheKey = `${cachePrefix}:chunks:${toExport.map((f) => f.id).join(",")}`;
  let chunks = getCached<KbTextChunk[]>(cacheKey);

  if (!chunks) {
    chunks = await buildKbChunks(toExport);
    setCached(cacheKey, chunks, 15 * 60_000);
  }

  return formatDriveContext(folderLabel, chunks, userQuery);
}

/** Быстро: только список файлов в KB, без скачивания текста. */
export async function getKnowledgeBaseTextForAi(
  userQuery: string,
  options?: { full?: boolean },
): Promise<string> {
  if (!isGoogleDriveKbConfigured()) {
    return "Knowledge Base: не настроена (GOOGLE_DRIVE_KB_FOLDER_ID).";
  }

  return getDriveTextForAi(
    process.env.GOOGLE_DRIVE_KB_FOLDER_ID!.trim(),
    "Knowledge Base",
    "kb-ai",
    MAX_FILES,
    userQuery,
    options,
  );
}

/** Папка «ЭМИГРАНТ» — копии документов клиентов (PDF, сканы и т.д.). */
export async function getEmigrantDriveTextForAi(
  userQuery: string,
  options?: { full?: boolean },
): Promise<string> {
  if (!isGoogleDriveEmigrantConfigured()) {
    return "Папка ЭМИГРАНТ: не настроена (GOOGLE_DRIVE_EMIGRANT_FOLDER_ID).";
  }

  return getDriveTextForAi(
    process.env.GOOGLE_DRIVE_EMIGRANT_FOLDER_ID!.trim(),
    "ЭМИГРАНТ",
    "emigrant-drive-ai",
    MAX_FILES_EMIGRANT,
    userQuery,
    options,
  );
}
