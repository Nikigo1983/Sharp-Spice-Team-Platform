import "server-only";

import {
  crmClientToContext,
  formgridRowToContext,
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
  buildNormalizedNameFields,
  extractLeadingCandidateName,
  scoreClientRecord,
  SCORE_AUTO,
  SCORE_MIN,
  SCORE_STRONG,
  SCORE_VIABLE,
  type SearchField,
} from "@/lib/ai/client-search";
import { isEmigrantDrivePrimaryQuery } from "@/lib/ai/query-intent";
import {
  getRecentClientSearches,
  recordClientSearch,
} from "@/lib/ai/client-search-history";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { listAllClients } from "@/lib/google-sheets/service";
import type { Client } from "@/lib/google-sheets/types";

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

function isEmptyField(value: string | undefined): boolean {
  return !value || value === "—";
}

function pushField(
  fields: SearchField[],
  label: string,
  value: string | undefined,
  category: SearchField["category"],
): void {
  if (isEmptyField(value)) return;
  fields.push({ label, value: value!.trim(), category });
}

function appendNormalizedNameFields(
  fields: SearchField[],
  ...names: Array<string | undefined>
): void {
  for (const name of names) {
    if (!name || name === "—") continue;
    fields.push(...buildNormalizedNameFields(name));
  }
}

function crmClientToSearchFields(client: Client): SearchField[] {
  const fields: SearchField[] = [];
  pushField(fields, "ФИО / фамилия", client.name, "name");
  appendNormalizedNameFields(fields, client.name);
  if (client.citizenship && client.citizenship !== "—") {
    pushField(fields, "ФИО (латиница)", client.citizenship, "name");
    appendNormalizedNameFields(fields, client.citizenship);
  }
  pushField(fields, "телефон", client.phone, "phone");
  pushField(fields, "email", client.email, "email");
  pushField(fields, "паспорт", client.passportNumber, "other");
  pushField(fields, "менеджер", client.manager, "other");
  pushField(fields, "заметки", client.notes, "notes");
  pushField(fields, "адрес букинга", client.bookingAddress, "other");
  pushField(fields, "даты букинга", client.bookingRange, "other");
  pushField(fields, "страна", client.country, "other");
  pushField(fields, "направление", client.direction, "other");
  pushField(fields, "статус", client.status, "other");
  return fields;
}

function formgridRowToSearchFields(headers: string[], row: string[]): SearchField[] {
  const fields: SearchField[] = [];
  const nameValues: string[] = [];

  headers.forEach((header, index) => {
    const value = (row[index] ?? "").trim();
    if (!header || !value) return;

    let category: SearchField["category"] = "other";
    if (/фио|name|имя|фамил|surname|first|last/i.test(header)) {
      category = "name";
      nameValues.push(value);
    } else if (/телефон|phone|whatsapp|telegram|тел\./i.test(header)) {
      category = "phone";
    } else if (/email|почта|e-mail|электронн|mail/i.test(header)) {
      category = "email";
    } else if (/коммент|замет|note|comment/i.test(header)) {
      category = "notes";
    }

    fields.push({ label: header, value, category });
  });

  appendNormalizedNameFields(fields, ...nameValues);
  return fields;
}

function buildCrmRawRow(client: Client): Record<string, string> {
  return {
    name: client.name,
    latinName: client.citizenship !== "—" ? client.citizenship : "",
    passport: client.passportNumber ?? "",
    submittedAt: client.submittedAt ?? "",
    expectedApprovalAt: client.expectedApprovalAt ?? "",
    referentName: client.referentName ?? "",
    bookingAddress: client.bookingAddress ?? "",
    bookingRange: client.bookingRange ?? "",
    approvalAt: client.approvalAt ?? "",
    notes: client.notes ?? "",
    residenceCardIssuedAt: client.residenceCardIssuedAt ?? "",
    appPassword: client.appPassword ?? "",
    manager: client.manager ?? "",
    status: client.status ?? "",
  };
}

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

  const searchQuery = buildClientSearchQuery(query);
  if (searchQuery.tokens.length > 0) return true;
  if (searchQuery.email) return true;
  if (searchQuery.phone) return true;
  return false;
}

async function collectClientMatches(
  query: string,
  minScore = SCORE_MIN,
): Promise<ClientContext[]> {
  const searchQuery = buildClientSearchQuery(query);
  const matches: ClientContext[] = [];

  const { items: crmClients } = await listAllClients();
  for (const client of crmClients) {
    const fields = crmClientToSearchFields(client);
    const { score, matchedFields } = scoreClientRecord(searchQuery, fields);
    if (score >= minScore) {
      const ctx = crmClientToContext(client, score, matchedFields);
      ctx.debugRow = {
        ...buildCrmRawRow(client),
        ...ctx.debugRow,
      };
      matches.push(ctx);
    }
  }

  const formgrid = await getFormgridLeadsTable();
  formgrid.rows.forEach((row, index) => {
    const fields = formgridRowToSearchFields(formgrid.headers, row);
    const { score, matchedFields } = scoreClientRecord(searchQuery, fields);
    if (score >= minScore) {
      matches.push(
        formgridRowToContext(
          formgrid.headers,
          row,
          index,
          score,
          matchedFields,
        ),
      );
    }
  });

  return matches.sort((a, b) => b.score - a.score);
}

export async function scanRawRowsForTokens(
  query: string,
): Promise<ClientDebugScanHit[]> {
  const tokens = extractLeadingCandidateName(query);
  if (tokens.length === 0) return [];

  const hits: ClientDebugScanHit[] = [];
  const tokenLower = tokens.map((t) => t.toLowerCase());

  const { items: crmClients } = await listAllClients();
  for (const client of crmClients) {
    const raw = buildCrmRawRow(client);
    for (const [column, value] of Object.entries(raw)) {
      const hay = value.toLowerCase();
      for (const token of tokenLower) {
        if (hay.includes(token)) {
          hits.push({
            source: "Клиенты",
            rowIndex: client.rowIndex ?? 0,
            column,
            value,
            matchedToken: token,
          });
        }
      }
    }
  }

  const formgrid = await getFormgridLeadsTable();
  formgrid.rows.forEach((row, index) => {
    formgrid.headers.forEach((header, colIndex) => {
      const value = (row[colIndex] ?? "").trim();
      if (!value) return;
      const hay = value.toLowerCase();
      for (const token of tokenLower) {
        if (hay.includes(token)) {
          hits.push({
            source: "Новые клиенты",
            rowIndex: index + 2,
            column: header || `col ${colIndex}`,
            value,
            matchedToken: token,
          });
        }
      }
    });
  });

  return hits;
}

export async function lookupAllClientMatches(
  query: string,
): Promise<ClientContext[]> {
  return collectClientMatches(query.trim(), SCORE_MIN);
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
  const [{ items, source: clientsSource }, formgrid] = await Promise.all([
    listAllClients(),
    getFormgridLeadsTable(),
  ]);

  return {
    clientsCount: items.length,
    newClientsCount: formgrid.rows.length,
    clientsSource,
    newClientsSource: formgrid.source,
    lastSyncedAt: syncedAt,
    configured: clientsSource === "google_sheets",
  };
}
