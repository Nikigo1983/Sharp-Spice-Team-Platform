import "server-only";

export type ClientSearchHistoryMatch = {
  name: string;
  score: number;
  source: string;
  rowIndex: number;
  matchedFields: string[];
};

export type ClientSearchHistoryEntry = {
  query: string;
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

export function getRecentClientSearches(): ClientSearchHistoryEntry[] {
  return [...history];
}
