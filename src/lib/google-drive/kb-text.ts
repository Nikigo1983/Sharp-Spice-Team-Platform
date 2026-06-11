import { fetchWithTlsFallback } from "@/lib/google-fetch";
import {
  extractPdfText,
  extractPlainText,
  isImageMime,
  isPdfMime,
  isPlainTextMime,
  snippetAroundTerms,
} from "@/lib/google-drive/drive-content";
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
const MAX_CONTENT_SCAN_FILES = 15;
const MAX_CHARS_PER_FILE = 4000;
const MAX_TOTAL_CHARS = 24_000;

const DRIVE_STOP_WORDS = new Set([
  "найди",
  "найти",
  "покажи",
  "дай",
  "мне",
  "информацию",
  "информация",
  "информации",
  "папке",
  "папка",
  "папку",
  "эмигрант",
  "emigrant",
  "drive",
  "google",
  "файл",
  "файлы",
  "файле",
  "документ",
  "документы",
  "документе",
  "limited",
  "liability",
  "company",
  "об",
  "про",
  "для",
  "что",
  "какой",
  "какая",
  "какие",
  "где",
  "есть",
  "наш",
  "нашей",
  "нашем",
  "клиент",
  "клиента",
  "клиенту",
]);

type DriveFileNode = {
  id: string;
  name: string;
  mimeType: string;
  path: string;
};

type KbTextChunk = {
  fileId: string;
  path: string;
  name: string;
  mimeType: string;
  text: string;
};

type DriveTextOptions = {
  full?: boolean;
  contentSearch?: boolean;
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

async function driveGetBytes(fileId: string): Promise<Buffer | null> {
  const token = await getGoogleAccessToken();
  if (!token) return null;

  const url = `${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`;
  try {
    const response = await fetchWithTlsFallback(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      console.error("[kb-text] media fetch error", response.status, fileId);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("[kb-text] media fetch failed", error);
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

function escapeDriveQueryTerm(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveFullTextSearch(
  folderId: string,
  terms: string[],
): Promise<Array<DriveFileNode & { hitScore: number }>> {
  const token = await getGoogleAccessToken();
  if (!token || terms.length === 0) return [];

  const byId = new Map<string, DriveFileNode & { hitScore: number }>();

  for (const term of terms.slice(0, 4)) {
    const q = `'${folderId}' in parents and trashed=false and fullText contains '${escapeDriveQueryTerm(term)}'`;
    const path = `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`;

    try {
      const response = await fetchWithTlsFallback(`${DRIVE_API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) continue;

      const data = (await response.json()) as {
        files?: Array<{ id: string; name: string; mimeType: string }>;
      };

      for (const file of data.files ?? []) {
        const existing = byId.get(file.id);
        if (existing) {
          existing.hitScore += 1;
          continue;
        }
        byId.set(file.id, {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          path: file.name,
          hitScore: 1,
        });
      }
    } catch (error) {
      console.error("[kb-text] fullText search failed", term, error);
    }
  }

  return [...byId.values()].sort((a, b) => b.hitScore - a.hitScore);
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
  const tokens = new Set<string>();
  const add = (raw: string) => {
    for (const part of raw.toLowerCase().split(/[^\p{L}\p{N}@.]+/u)) {
      const t = part.trim();
      if (t.length >= 2) tokens.add(t);
    }
  };

  for (const match of query.matchAll(/["«"']([^"»"']{2,})["»"']/gu)) {
    add(match[1] ?? "");
  }

  add(query);
  return [...tokens];
}

function meaningfulSearchTokens(query: string): string[] {
  return tokenizeQuery(query).filter(
    (token) => token.length >= 3 && !DRIVE_STOP_WORDS.has(token),
  );
}

function scoreChunk(chunk: KbTextChunk, tokens: string[]): number {
  const hay = `${chunk.path} ${chunk.name} ${chunk.text}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += 2;
  }
  return score;
}

function isUnextractedPlaceholder(text: string): boolean {
  return (
    text.includes("текст не извлечён") ||
    text.includes("текст доступен только если Google Drive")
  );
}

async function readCachedFileText(
  file: DriveFileNode,
): Promise<string | null> {
  const cacheKey = `drive-file-text:${file.id}`;
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;

  let text: string | null = null;

  if (isPdfMime(file.mimeType)) {
    const bytes = await driveGetBytes(file.id);
    if (bytes) text = await extractPdfText(bytes);
  } else if (isPlainTextMime(file.mimeType)) {
    const bytes = await driveGetBytes(file.id);
    if (bytes) text = extractPlainText(bytes);
  }

  if (text?.trim()) {
    setCached(cacheKey, text.trim(), 60 * 60_000);
    return text.trim();
  }

  return null;
}

async function fileToChunk(
  file: DriveFileNode,
  tokens: string[] = [],
): Promise<KbTextChunk> {
  const base = {
    fileId: file.id,
    path: file.path,
    name: file.name,
    mimeType: file.mimeType,
  };

  const exportMime = exportMimeFor(file.mimeType);
  if (exportMime) {
    const raw = await exportFileText(file.id, file.mimeType);
    if (raw?.trim()) {
      const trimmed = raw.trim();
      const text =
        tokens.length > 0 && trimmed.length > MAX_CHARS_PER_FILE
          ? `[Фрагмент]\n${snippetAroundTerms(trimmed, tokens)}`
          : truncate(trimmed, MAX_CHARS_PER_FILE);
      return { ...base, text };
    }
  }

  const extracted = await readCachedFileText(file);
  if (extracted) {
    const text =
      tokens.length > 0 && extracted.length > MAX_CHARS_PER_FILE
        ? `[Фрагмент PDF/файла]\n${snippetAroundTerms(extracted, tokens)}`
        : truncate(extracted, MAX_CHARS_PER_FILE);
    return { ...base, text };
  }

  if (isImageMime(file.mimeType)) {
    return {
      ...base,
      text: `[Изображение (${file.mimeType.split("/").pop()}): если Google Drive проиндексировал файл, он найдётся по содержимому. Локально текст из JPG без OCR не извлекается.]`,
    };
  }

  const typeLabel = isPdfMime(file.mimeType) ? "PDF" : file.mimeType;
  return {
    ...base,
    text: `[Файл в Drive — текст не извлечён (возможно скан без текстового слоя). Тип: ${typeLabel}.]`,
  };
}

async function buildKbChunks(
  files: DriveFileNode[],
  tokens: string[] = [],
): Promise<KbTextChunk[]> {
  const batchSize = 3;
  const chunks: KbTextChunk[] = [];

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const part = await Promise.all(batch.map((file) => fileToChunk(file, tokens)));
    chunks.push(...part);
  }

  return chunks;
}

function formatDriveContext(
  folderLabel: string,
  chunks: KbTextChunk[],
  query: string,
  totalFiles?: number,
): string {
  if (chunks.length === 0) {
    return `${folderLabel}: файлы не найдены или нет доступа к папке.`;
  }

  const tokens = meaningfulSearchTokens(query);
  const ranked = [...chunks].sort(
    (a, b) => scoreChunk(b, tokens) - scoreChunk(a, tokens),
  );

  const contentMatches = ranked.filter(
    (chunk) => scoreChunk(chunk, tokens) > 0 && !isUnextractedPlaceholder(chunk.text),
  );
  const fullTextOnly = ranked.filter(
    (chunk) => scoreChunk(chunk, tokens) > 0 && isUnextractedPlaceholder(chunk.text),
  );

  const selected = [
    ...contentMatches,
    ...fullTextOnly,
    ...ranked.filter((chunk) => scoreChunk(chunk, tokens) === 0),
  ].slice(0, 18);

  const limited = selected.slice(0, 18);
  let total = 0;
  const header =
    tokens.length > 0
      ? `${folderLabel} (Google Drive): поиск по содержимому «${tokens.join(", ")}» — найдено ${contentMatches.length + fullTextOnly.length} из ${totalFiles ?? chunks.length} файлов.`
      : `${folderLabel} (Google Drive): ${chunks.length} файлов, в ответ включено ${limited.length}.`;

  const parts: string[] = [header];

  for (const chunk of limited) {
    const block = `### ${chunk.path}\n${chunk.text}`;
    if (total + block.length > MAX_TOTAL_CHARS) {
      parts.push("… [остальные файлы опущены из‑за лимита контекста]");
      break;
    }
    parts.push(block);
    total += block.length;
  }

  if (contentMatches.length === 0 && tokens.length > 0) {
    parts.push(
      "Совпадений в тексте PDF/документов не найдено. Проверьте написание или откройте файл в Drive вручную.",
    );
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

function mergePaths(
  indexed: DriveFileNode[],
  hits: Array<DriveFileNode & { hitScore?: number }>,
): DriveFileNode[] {
  const byId = new Map(indexed.map((file) => [file.id, file]));
  return hits.map((hit) => {
    const known = byId.get(hit.id);
    return known ?? hit;
  });
}

async function getDriveContentSearchForAi(
  folderId: string,
  folderLabel: string,
  cachePrefix: string,
  maxFiles: number,
  userQuery: string,
): Promise<string> {
  const tokens = meaningfulSearchTokens(userQuery);
  const files = await getDriveFileList(
    folderId,
    `${cachePrefix}:files`,
    maxFiles,
  );

  if (files.length === 0) {
    return `${folderLabel}: файлы не найдены.`;
  }

  if (tokens.length === 0) {
    return getDriveCatalogForAi(
      folderId,
      folderLabel,
      `${cachePrefix}:files`,
      maxFiles,
      userQuery,
    );
  }

  const [fullTextHits] = await Promise.all([
    driveFullTextSearch(folderId, tokens),
  ]);

  const hitIds = new Set(fullTextHits.map((file) => file.id));
  const nameRanked = [...files].sort(
    (a, b) => scoreFile(b, tokens) - scoreFile(a, tokens),
  );

  const candidateMap = new Map<string, DriveFileNode>();

  for (const hit of mergePaths(files, fullTextHits)) {
    candidateMap.set(hit.id, hit);
  }

  for (const file of nameRanked.filter((f) => scoreFile(f, tokens) > 0).slice(0, 8)) {
    candidateMap.set(file.id, file);
  }

  if (candidateMap.size < MAX_CONTENT_SCAN_FILES) {
    for (const file of files) {
      if (candidateMap.size >= MAX_CONTENT_SCAN_FILES) break;
      if (candidateMap.has(file.id)) continue;
      if (
        isPdfMime(file.mimeType) ||
        isPlainTextMime(file.mimeType) ||
        exportMimeFor(file.mimeType) ||
        isImageMime(file.mimeType)
      ) {
        candidateMap.set(file.id, file);
      }
    }
  }

  const candidates = [...candidateMap.values()].slice(0, MAX_CONTENT_SCAN_FILES);
  const cacheKey = `${cachePrefix}:content:${candidates.map((file) => file.id).join(",")}:${tokens.join("|")}`;
  let chunks = getCached<KbTextChunk[]>(cacheKey);

  if (!chunks) {
    chunks = await buildKbChunks(candidates, tokens);
    setCached(cacheKey, chunks, 30 * 60_000);
  }

  const ranked = [...chunks].sort((a, b) => {
    const boost = (chunk: KbTextChunk) => (hitIds.has(chunk.fileId) ? 8 : 0);
    return scoreChunk(b, tokens) + boost(b) - (scoreChunk(a, tokens) + boost(a));
  });

  return formatDriveContext(folderLabel, ranked, userQuery, files.length);
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

  const tokens = meaningfulSearchTokens(userQuery);
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
  options?: DriveTextOptions,
): Promise<string> {
  const tokens = meaningfulSearchTokens(userQuery);

  if (options?.contentSearch && tokens.length > 0) {
    return getDriveContentSearchForAi(
      folderId,
      folderLabel,
      cachePrefix,
      maxFiles,
      userQuery,
    );
  }

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
    chunks = await buildKbChunks(toExport, tokens);
    setCached(cacheKey, chunks, 15 * 60_000);
  }

  return formatDriveContext(folderLabel, chunks, userQuery, files.length);
}

/** Быстро: только список файлов в KB, без скачивания текста. */
export async function getKnowledgeBaseTextForAi(
  userQuery: string,
  options?: DriveTextOptions,
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
  options?: DriveTextOptions,
): Promise<string> {
  if (!isGoogleDriveEmigrantConfigured()) {
    return "Папка ЭМИГРАНТ: не настроена (GOOGLE_DRIVE_EMIGRANT_FOLDER_ID).";
  }

  const tokens = meaningfulSearchTokens(userQuery);
  const contentSearch = options?.contentSearch ?? tokens.length > 0;

  return getDriveTextForAi(
    process.env.GOOGLE_DRIVE_EMIGRANT_FOLDER_ID!.trim(),
    "ЭМИГРАНТ",
    "emigrant-drive-ai",
    MAX_FILES_EMIGRANT,
    userQuery,
    {
      ...options,
      contentSearch,
      full: options?.full || contentSearch,
    },
  );
}
