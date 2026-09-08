/**
 * Deterministic Knowledge Base lexical retrieval helpers (no embeddings).
 * Pure functions — unit-tested with fixtures; used by kb-text.ts.
 */

import { annotateDriveContextWithProvenance } from "@/lib/ai/answer-grounding";

export type KbMatchReason = "filename" | "path" | "content" | "combined";

export type KbFileRef = {
  id: string;
  name: string;
  path: string;
  mimeType: string;
};

export type RankedKbDocument = {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  text: string;
  hasContent: boolean;
  filenameScore: number;
  pathScore: number;
  contentScore: number;
  phraseBonus: number;
  driveHitBonus: number;
  totalScore: number;
  matchReasons: KbMatchReason[];
};

const STOP_WORDS = new Set([
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
  "какие",
  "нужны",
  "нужно",
]);

export function extractMeaningfulKbTokens(query: string): string[] {
  const tokens = new Set<string>();
  const add = (raw: string) => {
    for (const part of raw.toLowerCase().split(/[^\p{L}\p{N}@.]+/u)) {
      const t = part.trim();
      if (t.length >= 3 && !STOP_WORDS.has(t)) tokens.add(t);
    }
  };

  for (const match of query.matchAll(/["«"']([^"»"']{2,})["»"']/gu)) {
    add(match[1] ?? "");
  }
  add(query);
  return [...tokens];
}

export function countTokenHits(haystack: string, tokens: string[]): number {
  const hay = haystack.toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    if (hay.includes(token.toLowerCase())) hits += 1;
  }
  return hits;
}

export function scoreFilenameTokens(name: string, tokens: string[]): number {
  const hay = name.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token.toLowerCase())) score += 2;
  }
  return score;
}

export function scorePathTokens(path: string, tokens: string[]): number {
  const hay = path.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token.toLowerCase())) score += 2;
  }
  return score;
}

export function scoreContentTokens(text: string, tokens: string[]): number {
  if (!text.trim()) return 0;
  const hay = text.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!hay.includes(token.toLowerCase())) continue;
    score += 3;
    // Extra weight for repeated evidence (capped).
    const occurrences = hay.split(token.toLowerCase()).length - 1;
    score += Math.min(occurrences - 1, 3);
  }
  return score;
}

/** Bonus when multi-token phrases from the query appear as contiguous spans. */
export function scorePhraseBonus(text: string, query: string): number {
  const hay = text.toLowerCase();
  const lower = query.toLowerCase();
  const phrases: string[] = [];

  for (const match of lower.matchAll(/["«"']([^"»"']{4,})["»"']/gu)) {
    const phrase = (match[1] ?? "").trim();
    if (phrase) phrases.push(phrase);
  }

  // Common bigrams/trigrams from meaningful tokens (order preserved).
  const tokens = extractMeaningfulKbTokens(query);
  for (let i = 0; i < tokens.length - 1; i++) {
    phrases.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  for (let i = 0; i < tokens.length - 2; i++) {
    phrases.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }

  let bonus = 0;
  const seen = new Set<string>();
  for (const phrase of phrases) {
    const key = phrase.trim().toLowerCase();
    if (key.length < 5 || seen.has(key)) continue;
    seen.add(key);
    if (hay.includes(key)) bonus += 6;
  }
  return bonus;
}

export function isFileInsideAllowedRoot(
  fileId: string,
  allowedFileIds: ReadonlySet<string>,
): boolean {
  return allowedFileIds.has(fileId);
}

export function partitionByKbRoot<T extends { id: string }>(
  files: T[],
  allowedFileIds: ReadonlySet<string>,
): { accepted: T[]; rejectedOutsideRoot: T[] } {
  const accepted: T[] = [];
  const rejectedOutsideRoot: T[] = [];
  for (const file of files) {
    if (allowedFileIds.has(file.id)) accepted.push(file);
    else rejectedOutsideRoot.push(file);
  }
  return { accepted, rejectedOutsideRoot };
}

export function dedupeByFileId<T extends { id: string }>(files: T[]): T[] {
  const byId = new Map<string, T>();
  for (const file of files) {
    if (!byId.has(file.id)) byId.set(file.id, file);
  }
  return [...byId.values()];
}

export function rankKbDocument(params: {
  file: KbFileRef;
  text: string;
  hasContent: boolean;
  tokens: string[];
  query: string;
  driveHitBonus?: number;
}): RankedKbDocument {
  const filenameScore = scoreFilenameTokens(params.file.name, params.tokens);
  const pathScore = scorePathTokens(params.file.path, params.tokens);
  const contentScore = params.hasContent
    ? scoreContentTokens(params.text, params.tokens)
    : 0;
  const phraseBonus = params.hasContent
    ? scorePhraseBonus(params.text, params.query)
    : 0;
  const driveHitBonus = params.driveHitBonus ?? 0;

  const matchReasons: KbMatchReason[] = [];
  if (filenameScore > 0) matchReasons.push("filename");
  if (pathScore > 0) matchReasons.push("path");
  if (contentScore > 0 || phraseBonus > 0) matchReasons.push("content");

  const uniqueReasons = [...new Set(matchReasons)];
  if (uniqueReasons.length > 1) {
    uniqueReasons.push("combined");
  }

  const totalScore =
    filenameScore + pathScore + contentScore + phraseBonus + driveHitBonus;

  return {
    id: params.file.id,
    name: params.file.name,
    path: params.file.path,
    mimeType: params.file.mimeType,
    text: params.text,
    hasContent: params.hasContent,
    filenameScore,
    pathScore,
    contentScore,
    phraseBonus,
    driveHitBonus,
    totalScore,
    matchReasons: uniqueReasons,
  };
}

/**
 * Select documents for KB context.
 * strictRelevance: drop zero-score / empty-content docs (no padding).
 */
export function selectRankedKbDocuments(
  ranked: RankedKbDocument[],
  options: { maxFiles: number; strictRelevance: boolean },
): RankedKbDocument[] {
  const sorted = [...ranked].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.contentScore !== a.contentScore) return b.contentScore - a.contentScore;
    if (b.phraseBonus !== a.phraseBonus) return b.phraseBonus - a.phraseBonus;
    return a.path.localeCompare(b.path, "en");
  });

  const filtered = options.strictRelevance
    ? sorted.filter(
        (doc) =>
          doc.totalScore > 0 &&
          doc.hasContent &&
          (doc.contentScore > 0 || doc.phraseBonus > 0),
      )
    : sorted;

  return dedupeByFileId(filtered).slice(0, options.maxFiles);
}

/** Prefer window around strongest multi-token match; keep nearby context. */
export function snippetAroundStrongestMatch(
  text: string,
  tokens: string[],
  radius = 220,
): string {
  if (!text) return text;
  if (tokens.length === 0) {
    return text.length <= radius * 2
      ? text
      : `${text.slice(0, radius * 2)}\n… [обрезано]`;
  }

  const lower = text.toLowerCase();
  let bestStart = -1;
  let bestHits = -1;

  for (const token of tokens) {
    const needle = token.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const index = lower.indexOf(needle, from);
      if (index < 0) break;
      const windowStart = Math.max(0, index - radius);
      const windowEnd = Math.min(text.length, index + radius);
      const window = lower.slice(windowStart, windowEnd);
      const hits = tokens.reduce(
        (sum, t) => sum + (window.includes(t.toLowerCase()) ? 1 : 0),
        0,
      );
      if (hits > bestHits) {
        bestHits = hits;
        bestStart = index;
      }
      from = index + needle.length;
    }
  }

  if (bestStart < 0) {
    return text.length <= radius * 2
      ? text
      : `${text.slice(0, radius * 2)}\n… [обрезано]`;
  }

  const start = Math.max(0, bestStart - radius);
  const end = Math.min(text.length, bestStart + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export function formatRankedKbContext(params: {
  folderLabel: string;
  docs: RankedKbDocument[];
  tokens: string[];
  totalFiles: number;
  maxTotalChars: number;
}): {
  text: string;
  selected: RankedKbDocument[];
  contentRetrieved: boolean;
  usefulContextEmpty: boolean;
} {
  const { folderLabel, docs, tokens, totalFiles, maxTotalChars } = params;

  if (docs.length === 0) {
    return {
      text:
        tokens.length > 0
          ? `${folderLabel}: релевантных документов по запросу не найдено.`
          : `${folderLabel}: файлы не найдены или нет доступа к папке.`,
      selected: [],
      contentRetrieved: false,
      usefulContextEmpty: true,
    };
  }

  const header = `${folderLabel} (Google Drive): поиск по содержимому «${tokens.join(", ")}» — включено ${docs.length} из ${totalFiles} файлов.`;
  const selected: RankedKbDocument[] = [];
  const provenanceFiles: Array<{
    path: string;
    text: string;
    hasContent: boolean;
    fileId: string;
  }> = [];
  let total = 0;
  const footerNotes: string[] = [];

  for (const doc of docs) {
    const title = doc.name;
    const body = doc.hasContent
      ? snippetAroundStrongestMatch(doc.text, tokens)
      : doc.text;
    const inner = [
      title !== doc.path ? `Название: ${title}` : null,
      body,
    ]
      .filter(Boolean)
      .join("\n");

    if (total + inner.length + doc.path.length > maxTotalChars) {
      footerNotes.push("… [остальные файлы опущены из‑за лимита контекста]");
      break;
    }
    total += inner.length;
    selected.push(doc);
    provenanceFiles.push({
      path: doc.path,
      text: inner,
      hasContent: doc.hasContent,
      fileId: doc.id,
    });
  }

  const annotated = annotateDriveContextWithProvenance({
    prefix: "KB",
    folderLabel,
    header,
    files: provenanceFiles,
    footerNotes,
  });

  const contentRetrieved = selected.some((doc) => doc.hasContent);
  const usefulContextEmpty = !selected.some(
    (doc) => doc.hasContent && (doc.contentScore > 0 || doc.phraseBonus > 0),
  );

  return {
    text: annotated.text,
    selected,
    contentRetrieved,
    usefulContextEmpty,
  };
}
