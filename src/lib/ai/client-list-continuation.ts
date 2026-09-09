/**
 * Shared client-list continuation helpers (safe for client + server).
 * No Sheets/LLM/server-only imports.
 */

export type ClientListContinuationState = {
  sourceQuery: string;
  offset: number;
  total: number;
  filterSummary?: string;
};

const MAX_CONTINUATION_OFFSET = 10_000;
const MAX_CONTINUATION_TOTAL = 10_000;
const MAX_SOURCE_QUERY_LENGTH = 2_000;

/** Detect follow-ups that should continue a prior structured list. */
export function isClientListContinuationQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  if (
    /^(давай\s+)?(следующ[\p{L}]*|дальше|ещё|еще|next|continue)(?!\p{L})/iu.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/^покажи\s+(ещё|еще|следующ[\p{L}]*)(?!\p{L})/iu.test(trimmed)) {
    return true;
  }
  if (/^продолж/iu.test(trimmed)) {
    return true;
  }
  return /показа[\p{L}]*\s+следующ|следующ[\p{L}]*\s+(?:част|клиент|запис)/iu.test(
    trimmed,
  );
}

export function isClientListContinuationState(
  value: unknown,
): value is ClientListContinuationState {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.sourceQuery !== "string") return false;
  const sourceQuery = row.sourceQuery.trim();
  if (!sourceQuery || sourceQuery.length > MAX_SOURCE_QUERY_LENGTH) return false;
  if (typeof row.offset !== "number" || !Number.isFinite(row.offset)) return false;
  if (row.offset < 0 || row.offset > MAX_CONTINUATION_OFFSET) return false;
  if (typeof row.total !== "number" || !Number.isFinite(row.total)) return false;
  if (row.total < 0 || row.total > MAX_CONTINUATION_TOTAL) return false;
  if (
    row.filterSummary !== undefined &&
    typeof row.filterSummary !== "string"
  ) {
    return false;
  }
  return true;
}

/** Validate/normalize client-supplied continuation; reject tampered payloads. */
export function sanitizeClientListContinuation(
  value: unknown,
): ClientListContinuationState | null {
  if (!isClientListContinuationState(value)) return null;
  return {
    sourceQuery: value.sourceQuery.trim().slice(0, MAX_SOURCE_QUERY_LENGTH),
    offset: Math.floor(value.offset),
    total: Math.floor(value.total),
    filterSummary:
      typeof value.filterSummary === "string"
        ? value.filterSummary.slice(0, 200)
        : undefined,
  };
}

type HistoryTurn = {
  role: string;
  content: string;
  clientListContinuation?: ClientListContinuationState | null;
};

/**
 * Resolve structured continuation for the next request from chat turns.
 * Invalidates when a non-continuation user turn or a non-list assistant turn
 * appears after the list page (prevents leaking across unrelated queries).
 */
export function resolveClientListContinuationFromHistory(
  history: HistoryTurn[],
  userMessage: string,
): ClientListContinuationState | null {
  if (!isClientListContinuationQuery(userMessage)) return null;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i];
    if (!turn) continue;

    if (turn.role === "assistant") {
      const sanitized = sanitizeClientListContinuation(
        turn.clientListContinuation ?? null,
      );
      if (sanitized) return sanitized;
      // Assistant reply without list continuation ends the list context.
      return null;
    }

    if (turn.role === "user") {
      if (isClientListContinuationQuery(turn.content)) continue;
      // Real user query after/before list context → do not resume.
      return null;
    }
  }

  return null;
}
