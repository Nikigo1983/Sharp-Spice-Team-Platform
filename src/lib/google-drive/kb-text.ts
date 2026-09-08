import { classifyKbGroundingState } from "@/lib/ai/kb-grounding";
import { annotateDriveContextWithProvenance } from "@/lib/ai/answer-grounding";
import type {
  DriveRetrievalMeta,
  DriveSelectedFileMeta,
} from "@/lib/ai/workspace-trace";
import { fetchWithTlsFallback } from "@/lib/google-fetch";
import {
  extractPdfText,
  extractPlainText,
  isImageMime,
  isPdfMime,
  isPlainTextMime,
} from "@/lib/google-drive/drive-content";
import {
  dedupeByFileId,
  extractMeaningfulKbTokens,
  formatRankedKbContext,
  partitionByKbRoot,
  rankKbDocument,
  selectRankedKbDocuments,
  snippetAroundStrongestMatch,
  type RankedKbDocument,
} from "@/lib/google-drive/kb-retrieval-core";
import {
  getGoogleAccessToken,
  isGoogleDriveEmigrantConfigured,
  isGoogleDriveKbConfigured,
} from "@/lib/google-sheets/auth";
import { getCached, setCached } from "@/lib/google-sheets/cache";

export type DriveRetrievalResult = {
  text: string;
  meta: DriveRetrievalMeta;
};

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_DOC = "application/vnd.google-apps.document";
const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDES = "application/vnd.google-apps.presentation";

const MAX_DEPTH = 6;
const MAX_FILES = 40;
/** KB tree walk slightly higher to reach nested program docs. */
const MAX_FILES_KB = 60;
const MAX_FILES_EMIGRANT = 60;
const MAX_FILES_FULL_EXPORT = 8;
const MAX_CONTENT_SCAN_FILES = 15;
/** Strict KB content mode: fewer, better files. */
const MAX_KB_CONTENT_SELECTED = 8;
const MAX_CHARS_PER_FILE = 4000;
const MAX_TOTAL_CHARS = 24_000;
const KB_SNIPPET_RADIUS = 220;

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

/**
 * Drive fullText search scoped to an allow-list of file IDs (KB/Emigrant tree).
 * Does NOT restrict to direct children — nested descendants can match — but any
 * hit outside the allow-list is rejected (folder boundary).
 */
async function driveFullTextSearchScoped(
  terms: string[],
  allowedFileIds: ReadonlySet<string>,
): Promise<{
  hits: Array<DriveFileNode & { hitScore: number }>;
  rejectedOutsideRoot: number;
}> {
  const token = await getGoogleAccessToken();
  if (!token || terms.length === 0) {
    return { hits: [], rejectedOutsideRoot: 0 };
  }

  const byId = new Map<string, DriveFileNode & { hitScore: number }>();
  let rejectedOutsideRoot = 0;

  for (const term of terms.slice(0, 4)) {
    const q = `trashed=false and fullText contains '${escapeDriveQueryTerm(term)}'`;
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
        if (!allowedFileIds.has(file.id)) {
          rejectedOutsideRoot += 1;
          continue;
        }
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

  return {
    hits: [...byId.values()].sort((a, b) => b.hitScore - a.hitScore),
    rejectedOutsideRoot,
  };
}

/** Legacy direct-child fullText (Emigrant compatibility path). */
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
          ? `[Фрагмент]\n${snippetAroundStrongestMatch(trimmed, tokens, KB_SNIPPET_RADIUS)}`
          : truncate(trimmed, MAX_CHARS_PER_FILE);
      return { ...base, text };
    }
  }

  const extracted = await readCachedFileText(file);
  if (extracted) {
    const text =
      tokens.length > 0 && extracted.length > MAX_CHARS_PER_FILE
        ? `[Фрагмент PDF/файла]\n${snippetAroundStrongestMatch(extracted, tokens, KB_SNIPPET_RADIUS)}`
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
): {
  text: string;
  selectedFiles: DriveSelectedFileMeta[];
  contentMatchCount: number;
  contentRetrieved: boolean;
  usefulContextEmpty: boolean;
} {
  if (chunks.length === 0) {
    return {
      text: `${folderLabel}: файлы не найдены или нет доступа к папке.`,
      selectedFiles: [],
      contentMatchCount: 0,
      contentRetrieved: false,
      usefulContextEmpty: true,
    };
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

  const included: DriveSelectedFileMeta[] = [];
  const provenanceFiles: Array<{
    path: string;
    text: string;
    hasContent: boolean;
    fileId: string;
  }> = [];

  for (const chunk of limited) {
    const hasContent = !isUnextractedPlaceholder(chunk.text);
    const provisional = `### ${chunk.path}\n${chunk.text}`;
    if (total + provisional.length > MAX_TOTAL_CHARS) {
      break;
    }
    total += provisional.length;
    included.push({
      id: chunk.fileId,
      path: chunk.path,
      score: scoreChunk(chunk, tokens),
      hasContent,
    });
    provenanceFiles.push({
      path: chunk.path,
      text: chunk.text,
      hasContent,
      fileId: chunk.fileId,
    });
  }

  const prefix = folderLabel.toLowerCase().includes("knowledge") ? "KB" : "DRIVE";
  const footerNotes: string[] = [];
  if (provenanceFiles.length < limited.length) {
    footerNotes.push("… [остальные файлы опущены из‑за лимита контекста]");
  }
  if (contentMatches.length === 0 && tokens.length > 0) {
    footerNotes.push(
      "Совпадений в тексте PDF/документов не найдено. Проверьте написание или откройте файл в Drive вручную.",
    );
  }

  const annotated = annotateDriveContextWithProvenance({
    prefix,
    folderLabel,
    header,
    files: provenanceFiles,
    footerNotes,
  });

  const contentRetrieved = included.some((file) => file.hasContent);
  const usefulContextEmpty =
    contentMatches.length === 0 || !included.some((file) => file.hasContent);

  return {
    text: annotated.text,
    selectedFiles: included,
    contentMatchCount: contentMatches.length,
    contentRetrieved,
    usefulContextEmpty,
  };
}

function buildDriveMeta(params: {
  source: DriveRetrievalMeta["source"];
  attempted: boolean;
  configured: boolean;
  mode: DriveRetrievalMeta["mode"];
  candidateFileCount: number;
  selectedFiles: DriveSelectedFileMeta[];
  contentRetrieved: boolean;
  usefulContextEmpty: boolean;
  text: string;
  errorMessage?: string;
  failed?: boolean;
  queryTokens?: string[];
  filenameSearchAttempted?: boolean;
  contentSearchAttempted?: boolean;
  rejectedOutsideRootCount?: number;
  retrievalLatencyMs?: number;
}): DriveRetrievalMeta {
  return {
    source: params.source,
    attempted: params.attempted,
    configured: params.configured,
    mode: params.mode,
    groundingState: classifyKbGroundingState({
      attempted: params.attempted,
      configured: params.configured,
      mode: params.mode,
      selectedFiles: params.selectedFiles,
      contentRetrieved: params.contentRetrieved,
      usefulContextEmpty: params.usefulContextEmpty,
      failed: params.failed,
    }),
    candidateFileCount: params.candidateFileCount,
    selectedFiles: params.selectedFiles,
    contentRetrieved: params.contentRetrieved,
    usefulContextEmpty: params.usefulContextEmpty,
    textCharCount: params.text.length,
    errorMessage: params.errorMessage,
    queryTokens: params.queryTokens,
    filenameSearchAttempted: params.filenameSearchAttempted,
    contentSearchAttempted: params.contentSearchAttempted,
    selectedCount: params.selectedFiles.length,
    rejectedOutsideRootCount: params.rejectedOutsideRootCount,
    retrievalLatencyMs: params.retrievalLatencyMs,
  };
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

/**
 * AI-02 Knowledge Base content retrieval:
 * - recursive tree under KB root
 * - Drive fullText scoped + filtered to tree membership
 * - filename/path + content lexical ranking
 * - no zero-score padding
 */
async function getKbStrictContentSearchForAi(
  folderId: string,
  folderLabel: string,
  cachePrefix: string,
  maxFiles: number,
  userQuery: string,
): Promise<DriveRetrievalResult> {
  const started = Date.now();
  const tokens = extractMeaningfulKbTokens(userQuery);
  const files = await getDriveFileList(
    folderId,
    `${cachePrefix}:files`,
    maxFiles,
  );
  const allowedIds = new Set(files.map((file) => file.id));

  if (files.length === 0) {
    const text = `${folderLabel}: файлы не найдены.`;
    return {
      text,
      meta: buildDriveMeta({
        source: "knowledge_base",
        attempted: true,
        configured: true,
        mode: "content",
        candidateFileCount: 0,
        selectedFiles: [],
        contentRetrieved: false,
        usefulContextEmpty: true,
        text,
        queryTokens: tokens,
        filenameSearchAttempted: true,
        contentSearchAttempted: true,
        rejectedOutsideRootCount: 0,
        retrievalLatencyMs: Date.now() - started,
      }),
    };
  }

  if (tokens.length === 0) {
    return getDriveCatalogForAi(
      "knowledge_base",
      folderId,
      folderLabel,
      `${cachePrefix}:files`,
      maxFiles,
      userQuery,
    );
  }

  const { hits: fullTextHits, rejectedOutsideRoot } =
    await driveFullTextSearchScoped(tokens, allowedIds);

  const hitScoreById = new Map(
    fullTextHits.map((hit) => [hit.id, hit.hitScore] as const),
  );

  const filenamePathMatches = files.filter(
    (file) =>
      scoreFile(file, tokens) > 0 ||
      extractMeaningfulKbTokens(`${file.path} ${file.name}`).some((t) =>
        tokens.includes(t),
      ),
  );

  const candidateMap = new Map<string, DriveFileNode>();
  for (const hit of mergePaths(files, fullTextHits)) {
    if (!allowedIds.has(hit.id)) continue;
    candidateMap.set(hit.id, hit);
  }
  for (const file of filenamePathMatches) {
    candidateMap.set(file.id, file);
  }

  // Discover content-only matches by scanning additional extractable files
  // inside the tree — still filtered by score after extraction (no padding).
  if (candidateMap.size < MAX_CONTENT_SCAN_FILES) {
    for (const file of files) {
      if (candidateMap.size >= MAX_CONTENT_SCAN_FILES) break;
      if (candidateMap.has(file.id)) continue;
      if (
        isPdfMime(file.mimeType) ||
        isPlainTextMime(file.mimeType) ||
        exportMimeFor(file.mimeType)
      ) {
        candidateMap.set(file.id, file);
      }
    }
  }

  const candidates = dedupeByFileId([...candidateMap.values()]).filter((file) =>
    allowedIds.has(file.id),
  );
  const { rejectedOutsideRoot: rejectedFromMerge } = partitionByKbRoot(
    [...candidateMap.values()],
    allowedIds,
  );

  const cacheKey = `${cachePrefix}:kb-content-v2:${candidates.map((f) => f.id).join(",")}:${tokens.join("|")}`;
  let chunks = getCached<KbTextChunk[]>(cacheKey);
  if (!chunks) {
    chunks = await buildKbChunks(candidates, tokens);
    setCached(cacheKey, chunks, 30 * 60_000);
  }

  const ranked: RankedKbDocument[] = chunks.map((chunk) => {
    const hasContent = !isUnextractedPlaceholder(chunk.text);
    return rankKbDocument({
      file: {
        id: chunk.fileId,
        name: chunk.name,
        path: chunk.path,
        mimeType: chunk.mimeType,
      },
      text: chunk.text,
      hasContent,
      tokens,
      query: userQuery,
      driveHitBonus: (hitScoreById.get(chunk.fileId) ?? 0) * 4,
    });
  });

  const selectedDocs = selectRankedKbDocuments(ranked, {
    maxFiles: MAX_KB_CONTENT_SELECTED,
    strictRelevance: true,
  });

  const formatted = formatRankedKbContext({
    folderLabel,
    docs: selectedDocs,
    tokens,
    totalFiles: files.length,
    maxTotalChars: MAX_TOTAL_CHARS,
  });

  const selectedFiles: DriveSelectedFileMeta[] = formatted.selected.map(
    (doc) => ({
      id: doc.id,
      path: doc.path,
      score: doc.totalScore,
      hasContent: doc.hasContent,
      matchReasons: doc.matchReasons,
      extractionOk: doc.hasContent,
    }),
  );

  return {
    text: formatted.text,
    meta: buildDriveMeta({
      source: "knowledge_base",
      attempted: true,
      configured: true,
      mode: "content",
      candidateFileCount: candidates.length,
      selectedFiles,
      contentRetrieved: formatted.contentRetrieved,
      usefulContextEmpty: formatted.usefulContextEmpty,
      text: formatted.text,
      queryTokens: tokens,
      filenameSearchAttempted: true,
      contentSearchAttempted: true,
      rejectedOutsideRootCount: rejectedOutsideRoot + rejectedFromMerge.length,
      retrievalLatencyMs: Date.now() - started,
    }),
  };
}

async function getDriveContentSearchForAi(
  source: DriveRetrievalMeta["source"],
  folderId: string,
  folderLabel: string,
  cachePrefix: string,
  maxFiles: number,
  userQuery: string,
): Promise<DriveRetrievalResult> {
  const tokens = meaningfulSearchTokens(userQuery);
  const files = await getDriveFileList(
    folderId,
    `${cachePrefix}:files`,
    maxFiles,
  );

  if (files.length === 0) {
    const text = `${folderLabel}: файлы не найдены.`;
    return {
      text,
      meta: buildDriveMeta({
        source,
        attempted: true,
        configured: true,
        mode: "content",
        candidateFileCount: 0,
        selectedFiles: [],
        contentRetrieved: false,
        usefulContextEmpty: true,
        text,
      }),
    };
  }

  if (tokens.length === 0) {
    return getDriveCatalogForAi(
      source,
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

  const formatted = formatDriveContext(folderLabel, ranked, userQuery, files.length);
  return {
    text: formatted.text,
    meta: buildDriveMeta({
      source,
      attempted: true,
      configured: true,
      mode: "content",
      candidateFileCount: files.length,
      selectedFiles: formatted.selectedFiles,
      contentRetrieved: formatted.contentRetrieved,
      usefulContextEmpty: formatted.usefulContextEmpty,
      text: formatted.text,
    }),
  };
}

async function getDriveCatalogForAi(
  source: DriveRetrievalMeta["source"],
  folderId: string,
  folderLabel: string,
  cacheKey: string,
  maxFiles: number,
  userQuery: string,
): Promise<DriveRetrievalResult> {
  const files = await getDriveFileList(folderId, cacheKey, maxFiles);
  if (files.length === 0) {
    const text = `${folderLabel}: файлы не найдены.`;
    return {
      text,
      meta: buildDriveMeta({
        source,
        attempted: true,
        configured: true,
        mode: "catalog",
        candidateFileCount: 0,
        selectedFiles: [],
        contentRetrieved: false,
        usefulContextEmpty: true,
        text,
      }),
    };
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
  const text = `${folderLabel} — список файлов (${files.length} всего, показано ${lines.length}):\n${lines.join("\n")}`;
  const selectedFiles: DriveSelectedFileMeta[] = picked.map((file) => ({
    id: file.id,
    path: file.path,
    score: scoreFile(file, tokens),
    hasContent: false,
  }));

  return {
    text,
    meta: buildDriveMeta({
      source,
      attempted: true,
      configured: true,
      mode: "catalog",
      candidateFileCount: files.length,
      selectedFiles,
      contentRetrieved: false,
      usefulContextEmpty: true,
      text,
    }),
  };
}

async function getDriveTextForAi(
  source: DriveRetrievalMeta["source"],
  folderId: string,
  folderLabel: string,
  cachePrefix: string,
  maxFiles: number,
  userQuery: string,
  options?: DriveTextOptions,
): Promise<DriveRetrievalResult> {
  const tokens = meaningfulSearchTokens(userQuery);

  if (options?.contentSearch && tokens.length > 0) {
    if (source === "knowledge_base") {
      return getKbStrictContentSearchForAi(
        folderId,
        folderLabel,
        cachePrefix,
        maxFiles,
        userQuery,
      );
    }
    return getDriveContentSearchForAi(
      source,
      folderId,
      folderLabel,
      cachePrefix,
      maxFiles,
      userQuery,
    );
  }

  if (!options?.full) {
    return getDriveCatalogForAi(
      source,
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

  const formatted = formatDriveContext(folderLabel, chunks, userQuery, files.length);
  return {
    text: formatted.text,
    meta: buildDriveMeta({
      source,
      attempted: true,
      configured: true,
      mode: "full_export",
      candidateFileCount: files.length,
      selectedFiles: formatted.selectedFiles,
      contentRetrieved: formatted.contentRetrieved,
      usefulContextEmpty: formatted.usefulContextEmpty,
      text: formatted.text,
      queryTokens: tokens,
      filenameSearchAttempted: true,
      contentSearchAttempted: false,
    }),
  };
}

function unconfiguredResult(
  source: DriveRetrievalMeta["source"],
  text: string,
): DriveRetrievalResult {
  return {
    text,
    meta: buildDriveMeta({
      source,
      attempted: true,
      configured: false,
      mode: "unconfigured",
      candidateFileCount: 0,
      selectedFiles: [],
      contentRetrieved: false,
      usefulContextEmpty: true,
      text,
      failed: true,
      errorMessage: "not_configured",
    }),
  };
}

function failedResult(
  source: DriveRetrievalMeta["source"],
  text: string,
  errorMessage: string,
): DriveRetrievalResult {
  return {
    text,
    meta: buildDriveMeta({
      source,
      attempted: true,
      configured: true,
      mode: "failed",
      candidateFileCount: 0,
      selectedFiles: [],
      contentRetrieved: false,
      usefulContextEmpty: true,
      text,
      failed: true,
      errorMessage,
    }),
  };
}

/** Knowledge Base: content search enabled when query has meaningful tokens (AI-02). */
export async function getKnowledgeBaseTextForAi(
  userQuery: string,
  options?: DriveTextOptions,
): Promise<DriveRetrievalResult> {
  if (!isGoogleDriveKbConfigured()) {
    return unconfiguredResult(
      "knowledge_base",
      "Knowledge Base: не настроена (GOOGLE_DRIVE_KB_FOLDER_ID).",
    );
  }

  const tokens = meaningfulSearchTokens(userQuery);
  const contentSearch = options?.contentSearch ?? tokens.length > 0;

  try {
    return await getDriveTextForAi(
      "knowledge_base",
      process.env.GOOGLE_DRIVE_KB_FOLDER_ID!.trim(),
      "Knowledge Base",
      "kb-ai",
      MAX_FILES_KB,
      userQuery,
      {
        ...options,
        contentSearch,
        full: options?.full || contentSearch,
      },
    );
  } catch (error) {
    console.error("[kb-text] knowledge base retrieval failed", error);
    return failedResult(
      "knowledge_base",
      "Knowledge Base: не удалось загрузить Drive.",
      error instanceof Error ? error.message : "unknown_error",
    );
  }
}

/** Папка «ЭМИГРАНТ» — копии документов клиентов (PDF, сканы и т.д.). */
export async function getEmigrantDriveTextForAi(
  userQuery: string,
  options?: DriveTextOptions,
): Promise<DriveRetrievalResult> {
  if (!isGoogleDriveEmigrantConfigured()) {
    return unconfiguredResult(
      "emigrant_drive",
      "Папка ЭМИГРАНТ: не настроена (GOOGLE_DRIVE_EMIGRANT_FOLDER_ID).",
    );
  }

  const tokens = meaningfulSearchTokens(userQuery);
  const contentSearch = options?.contentSearch ?? tokens.length > 0;

  try {
    return await getDriveTextForAi(
      "emigrant_drive",
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
  } catch (error) {
    console.error("[kb-text] emigrant drive retrieval failed", error);
    return failedResult(
      "emigrant_drive",
      "Папка ЭМИГРАНТ: не удалось загрузить Google Drive.",
      error instanceof Error ? error.message : "unknown_error",
    );
  }
}
