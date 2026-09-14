import "server-only";

import {
  isSensitiveFieldKey,
  redactDebugRow,
  redactForLogging,
} from "@/lib/ai/context-redaction";
import {
  isMergedClientContext,
  type ClientContext,
  type ClientDebugScanHit,
  type MergedClientContext,
  type ResolvedClientContext,
} from "@/lib/ai/client-context";
import {
  deduplicateToResolved,
  groupDuplicateClients,
} from "@/lib/ai/client-deduplication";
import {
  extractClientEntityFromQuery,
  logClientEntityExtraction,
} from "@/lib/ai/client-entity-extract";
import {
  buildClientSearchQuery,
  extractLeadingCandidateName,
  scoreClientRecord,
  SCORE_AUTO,
  SCORE_FUZZY,
  SCORE_MIN,
  SCORE_STRONG,
  SCORE_VIABLE,
} from "@/lib/ai/client-search";
import {
  analyzeClientSearchIntent,
  EMPTY_CLIENT_SEARCH_INTENT,
  hasStructuredSearchFilters,
  isClientContextualQuery,
  LIST_QUERY_CLIENT_LIMIT,
  resolveClientSearchIntentType,
  type ClientSearchIntent,
  type ClientSearchIntentType,
} from "@/lib/ai/client-search-intent";
import { executeStructuredClientSearch } from "@/lib/ai/structured-client-search";
import { isEmigrantDrivePrimaryQuery } from "@/lib/ai/query-intent";
import {
  getRecentClientSearches,
  recordClientSearch,
} from "@/lib/ai/client-search-history";
import {
  listPortalIntakeCasesForAi,
  portalCaseToContext,
  portalCaseToSearchFields,
  PORTAL_INTAKE_SOURCE_LABEL,
} from "@/lib/ai/portal-intake-clients";

const DEBUG_PREFIX = /^\/debug_client(?:\s+(.+))?$/iu;

export type { ClientDebugScanHit } from "@/lib/ai/client-context";

export type ClientLookupResult =
  | { kind: "skip" }
  | { kind: "not_found"; query: string }
  | { kind: "single"; client: ResolvedClientContext; query: string }
  | {
      kind: "multiple";
      clients: ResolvedClientContext[];
      pendingParts: ClientContext[];
      query: string;
    }
  | { kind: "weak"; clients: ResolvedClientContext[]; query: string };

export type SheetsConnectionHealth = {
  clientsCount: number;
  newClientsCount: number;
  clientsSource: string;
  newClientsSource: string;
  lastSyncedAt: string;
  configured: boolean;
};

function pickBestMatches(
  matches: ClientContext[],
  query: string,
): ClientLookupResult {
  const candidates = matches
    .filter((match) => match.score >= SCORE_MIN)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return { kind: "not_found", query };
  }

  const resolved = deduplicateToResolved(candidates);
  const [top, second] = resolved;
  const topScore = top.score;
  const strong = resolved.filter((match) => match.score >= SCORE_STRONG);
  const autoCandidates = resolved.filter((match) => match.score >= SCORE_AUTO);

  if (autoCandidates.length === 1 && resolved.length === 1) {
    return { kind: "single", client: autoCandidates[0], query };
  }

  if (
    resolved.length === 1 &&
    topScore >= SCORE_VIABLE
  ) {
    return { kind: "single", client: top, query };
  }

  if (
    topScore >= SCORE_AUTO &&
    (!second || topScore - second.score >= 12)
  ) {
    return { kind: "single", client: top, query };
  }

  if (strong.length === 1 && resolved.length === 1) {
    return { kind: "single", client: strong[0], query };
  }

  if (resolved.length > 1) {
    const strongResolved = resolved.filter((m) => m.score >= SCORE_STRONG);
    const list =
      strongResolved.length > 1 ? strongResolved : resolved.filter((m) => m.score >= SCORE_VIABLE);
    if (list.length > 1) {
      return {
        kind: "multiple",
        clients: list.slice(0, 8),
        pendingParts: candidates.slice(0, 12),
        query,
      };
    }
  }

  if (resolved.length === 1) {
    return { kind: "single", client: top, query };
  }

  const viable = resolved.filter((match) => match.score >= SCORE_VIABLE);
  if (viable.length > 1) {
    return {
      kind: "multiple",
      clients: viable.slice(0, 8),
      pendingParts: candidates.slice(0, 12),
      query,
    };
  }

  if (viable.length === 1) {
    return { kind: "single", client: viable[0], query };
  }

  return { kind: "weak", clients: resolved.slice(0, 8), query };
}

function logSearchResult(
  query: string,
  result: ClientLookupResult,
  allMatches: ClientContext[],
): void {
  const topScore = allMatches[0]?.score ?? 0;
  recordClientSearch({
    query,
    at: new Date().toISOString(),
    resultKind: result.kind,
    topScore,
    matchCount: allMatches.length,
    matches: allMatches.slice(0, 5).map((match) => ({
      name: match.name,
      score: match.score,
      source: match.sourceLabel,
      rowIndex: match.rowIndex,
      matchedFields: match.matchedFields,
    })),
  });
}

export function isDebugClientCommand(query: string): boolean {
  return DEBUG_PREFIX.test(query.trim());
}

export function parseDebugClientQuery(query: string): string {
  const match = query.trim().match(DEBUG_PREFIX);
  return match?.[1]?.trim() ?? "";
}

export { buildClientSearchQuery, getRecentClientSearches, groupDuplicateClients };

export function isClientRelatedQuery(query: string): boolean {
  if (needsClientLookup(query)) return true;

  const lower = query.toLowerCase();
  return /клиент|анкет|заявк|менеджер|консультац/i.test(lower);
}

export function needsClientLookup(query: string): boolean {
  if (isDebugClientCommand(query)) return true;
  if (isEmigrantDrivePrimaryQuery(query)) return false;
  if (isClientContextualQuery(query)) return true;

  const searchQuery = buildClientSearchQuery(query);
  if (searchQuery.tokens.length > 0) return true;
  if (searchQuery.email) return true;
  if (searchQuery.phone) return true;
  return false;
}

export type ClientAiSearchResult = {
  lookup: ClientLookupResult;
  intent: ClientSearchIntent;
  usedStructuredSearch: boolean;
  intentType: ClientSearchIntentType;
  foundClients: number;
  sentToClaude: number;
};

function logAiSearchAudit(payload: {
  query: string;
  intentType: ClientSearchIntentType;
  foundClients: number;
  sentToClaude: number;
  structuredCount: number;
}): void {
  console.log(`AI SEARCH RESULTS COUNT: ${payload.structuredCount}`);
  console.log(`Found clients: ${payload.foundClients}`);
  console.log(`Sent to Claude: ${payload.sentToClaude}`);
  console.log(`Intent type: ${payload.intentType}`);
  console.log("[ai-client-search]", redactForLogging({
    query: payload.query,
    intentType: payload.intentType,
    foundClients: payload.foundClients,
    sentToClaude: payload.sentToClaude,
    structuredCount: payload.structuredCount,
  }));
}

function structuredToLookupResult(
  clients: ResolvedClientContext[],
  query: string,
  candidates: ClientContext[],
  isListQuery: boolean,
): ClientLookupResult {
  if (clients.length === 0) {
    return { kind: "not_found", query };
  }
  if (clients.length === 1 && !isListQuery) {
    return { kind: "single", client: clients[0], query };
  }
  return {
    kind: "multiple",
    clients,
    pendingParts: candidates.slice(0, isListQuery ? LIST_QUERY_CLIENT_LIMIT : 12),
    query,
  };
}

/** AI Client Search: анализ запроса → структурированный поиск по всем колонкам. */
export async function lookupClientsWithAiSearch(
  query: string,
): Promise<ClientAiSearchResult> {
  const trimmed = query.trim();

  if (!needsClientLookup(trimmed)) {
    return {
      lookup: { kind: "skip" },
      intent: EMPTY_CLIENT_SEARCH_INTENT,
      usedStructuredSearch: false,
      intentType: "single",
      foundClients: 0,
      sentToClaude: 0,
    };
  }

  const intent = await analyzeClientSearchIntent(trimmed);
  const intentType = resolveClientSearchIntentType(intent, trimmed);
  const isListQuery = intentType === "list";
  const searchLimit = isListQuery ? LIST_QUERY_CLIENT_LIMIT : 10;
  const useStructured =
    hasStructuredSearchFilters(intent) || isClientContextualQuery(trimmed);

  if (useStructured) {
    const structured = await executeStructuredClientSearch(
      intent,
      trimmed,
      searchLimit,
    );
    const structuredMatches = structured.clients;
    const foundClients = structured.totalFound;
    const sentToClaude = structuredMatches.length;

    logAiSearchAudit({
      query: trimmed,
      intentType,
      foundClients,
      sentToClaude,
      structuredCount: foundClients,
    });

    if (structuredMatches.length > 0) {
      const rawCandidates = structuredMatches.flatMap((client) =>
        isMergedClientContext(client) ? client.parts : [client],
      );
      const lookup = structuredToLookupResult(
        structuredMatches,
        trimmed,
        rawCandidates,
        isListQuery,
      );
      logSearchResult(trimmed, lookup, rawCandidates);
      return {
        lookup,
        intent,
        usedStructuredSearch: true,
        intentType,
        foundClients,
        sentToClaude,
      };
    }

    if (isListQuery) {
      return {
        lookup: { kind: "not_found", query: trimmed },
        intent,
        usedStructuredSearch: true,
        intentType,
        foundClients: 0,
        sentToClaude: 0,
      };
    }
  }

  const lookup = await lookupClientsInSheets(trimmed);
  const foundClients =
    lookup.kind === "single"
      ? 1
      : lookup.kind === "multiple" || lookup.kind === "weak"
        ? lookup.clients.length
        : 0;
  const sentToClaude = foundClients;

  logAiSearchAudit({
    query: trimmed,
    intentType,
    foundClients,
    sentToClaude,
    structuredCount: 0,
  });

  return {
    lookup,
    intent,
    usedStructuredSearch: false,
    intentType,
    foundClients,
    sentToClaude,
  };
}

async function collectClientMatches(
  query: string,
  minScore = SCORE_MIN,
): Promise<ClientContext[]> {
  const searchQuery = buildClientSearchQuery(query);
  const matches: ClientContext[] = [];

  const cases = await listPortalIntakeCasesForAi();
  for (const record of cases) {
    const fields = portalCaseToSearchFields(record);
    const { score, matchedFields } = scoreClientRecord(searchQuery, fields);
    if (score >= minScore) {
      const ctx = portalCaseToContext(record, score, matchedFields);
      ctx.debugRow = redactDebugRow(ctx.debugRow);
      matches.push(ctx);
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

export async function scanRawRowsForTokens(
  query: string,
): Promise<ClientDebugScanHit[]> {
  const tokens = extractLeadingCandidateName(query);
  if (tokens.length === 0) return [];

  const hits: ClientDebugScanHit[] = [];
  const tokenLower = tokens.map((t) => t.toLowerCase());

  const cases = await listPortalIntakeCasesForAi({ includeArchived: true });
  for (const record of cases) {
    const ctx = portalCaseToContext(record, 0);
    for (const [column, value] of Object.entries(ctx.debugRow)) {
      if (isSensitiveFieldKey(column)) continue;
      const hay = value.toLowerCase();
      for (const token of tokenLower) {
        if (hay.includes(token)) {
          hits.push({
            source: PORTAL_INTAKE_SOURCE_LABEL,
            rowIndex: 0,
            column,
            value,
            matchedToken: token,
          });
        }
      }
    }
  }

  return hits;
}

export async function lookupAllClientMatches(
  query: string,
): Promise<ClientContext[]> {
  return collectClientMatches(query.trim(), SCORE_MIN);
}

/** Fuzzy-поиск: топ кандидатов для AI, когда точного match нет. */
export async function lookupFuzzyClientCandidates(
  query: string,
  limit = 10,
): Promise<ResolvedClientContext[]> {
  const trimmed = query.trim();
  if (!needsClientLookup(trimmed)) return [];

  const searchQueryText = isDebugClientCommand(trimmed)
    ? parseDebugClientQuery(trimmed) || trimmed
    : trimmed;

  const matches = await collectClientMatches(searchQueryText, SCORE_FUZZY);
  return deduplicateToResolved(matches).slice(0, limit);
}

export async function lookupClientsInSheets(
  query: string,
): Promise<ClientLookupResult> {
  const trimmed = query.trim();
  if (!needsClientLookup(trimmed)) {
    return { kind: "skip" };
  }

  const searchQueryText = isDebugClientCommand(trimmed)
    ? parseDebugClientQuery(trimmed) || trimmed
    : trimmed;
  const entityExtraction = extractClientEntityFromQuery(searchQueryText);

  const matches = await collectClientMatches(searchQueryText, SCORE_MIN);
  const result = pickBestMatches(matches, searchQueryText);
  logSearchResult(searchQueryText, result, matches);

  const clientName =
    result.kind === "single"
      ? result.client.name
      : result.kind === "multiple"
        ? result.clients[0]?.name
        : undefined;

  logClientEntityExtraction(trimmed, entityExtraction, {
    kind: result.kind,
    clientName,
  });

  if (result.kind === "not_found") {
    return { kind: "not_found", query: searchQueryText };
  }
  if (result.kind === "single") {
    return { kind: "single", client: result.client, query: searchQueryText };
  }
  if (result.kind === "multiple") {
    return {
      kind: "multiple",
      clients: result.clients,
      pendingParts: result.pendingParts,
      query: searchQueryText,
    };
  }
  if (result.kind === "weak") {
    return { kind: "weak", clients: result.clients, query: searchQueryText };
  }

  return { kind: "skip" };
}

export async function getSheetsConnectionHealth(): Promise<SheetsConnectionHealth> {
  const syncedAt = new Date().toISOString();
  const cases = await listPortalIntakeCasesForAi();

  return {
    clientsCount: cases.length,
    newClientsCount: 0,
    clientsSource: "portal_intake",
    newClientsSource: "disabled",
    lastSyncedAt: syncedAt,
    configured: true,
  };
}
