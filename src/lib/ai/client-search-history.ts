/**
 * In-memory client search history (Phase 2 privacy-safe).
 * Stores metadata only — never raw query text or client names.
 */

export type ClientSearchHistoryMatch = {
  /** Privacy: name removed; presence/length only. */
  namePresent: boolean;
  nameLength: number;
  score: number;
  source: string;
  rowIndex: number;
  matchedFieldCount: number;
};

export type ClientSearchHistoryEntry = {
  queryPresent: boolean;
  queryLength: number;
  at: string;
  resultKind: string;
  topScore: number;
  matchCount: number;
  matches: ClientSearchHistoryMatch[];
};

const MAX_HISTORY = 5;
const history: ClientSearchHistoryEntry[] = [];

export function recordClientSearch(entry: ClientSearchHistoryEntry): void {
  history.unshift(entry);
  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }
}

/** Build a privacy-safe history entry from raw lookup data. */
export function buildSafeClientSearchHistoryEntry(params: {
  query: string;
  resultKind: string;
  topScore: number;
  matchCount: number;
  matches: Array<{
    name: string;
    score: number;
    source: string;
    rowIndex: number;
    matchedFields: string[];
  }>;
}): ClientSearchHistoryEntry {
  const q = params.query.trim();
  return {
    queryPresent: Boolean(q),
    queryLength: q.length,
    at: new Date().toISOString(),
    resultKind: params.resultKind,
    topScore: params.topScore,
    matchCount: params.matchCount,
    matches: params.matches.slice(0, 5).map((match) => ({
      namePresent: Boolean(match.name?.trim()),
      nameLength: match.name?.trim().length ?? 0,
      score: match.score,
      source: match.source,
      rowIndex: match.rowIndex,
      matchedFieldCount: match.matchedFields?.length ?? 0,
    })),
  };
}

export function getRecentClientSearches(): ClientSearchHistoryEntry[] {
  return [...history];
}

/** Test helper: wipe ring buffer. */
export function clearClientSearchHistoryForTests(): void {
  history.length = 0;
}
