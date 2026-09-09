/**
 * Deterministic structured CRM list answers.
 * Prefer complete matched sets over LLM pagination prose.
 */

import {
  isMergedClientContext,
  type ResolvedClientContext,
} from "@/lib/ai/client-context";
import type { ClientSearchIntent } from "@/lib/ai/client-search-intent";
import {
  isClientListQuery,
  parseClientSearchIntentRules,
} from "@/lib/ai/client-search-intent";
import {
  isClientListContinuationQuery,
  type ClientListContinuationState,
} from "@/lib/ai/client-list-continuation";

export type { ClientListContinuationState } from "@/lib/ai/client-list-continuation";
export {
  isClientListContinuationQuery,
  resolveClientListContinuationFromHistory,
  sanitizeClientListContinuation,
} from "@/lib/ai/client-list-continuation";

/** Fetch / return ceiling for structured list queries (one answer). */
export const LIST_QUERY_FULL_RETURN_LIMIT = 100;

/**
 * Only paginate when matched rows exceed the full-return ceiling.
 * Page size equals the full-return limit (not an arbitrary 20).
 */
export const LIST_QUERY_PAGE_SIZE = LIST_QUERY_FULL_RETURN_LIMIT;

/** Preferred alias for the structured client-list page size. */
export const CLIENT_LIST_PAGE_SIZE = LIST_QUERY_PAGE_SIZE;

function displayStatus(value: string | undefined | null): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "—") return "статус не указан";
  return trimmed;
}

function displayManager(value: string | undefined | null): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "—") return "менеджер не указан";
  return trimmed;
}

export function buildClientListFilterLabel(intent: ClientSearchIntent): string {
  if (intent.partnerName) return `от партнёра ${intent.partnerName}`;
  if (intent.manager) return `менеджера ${intent.manager}`;
  if (intent.status) return `со статусом «${intent.status}»`;
  if (intent.country || intent.direction) {
    return `по направлению ${intent.country || intent.direction}`;
  }
  if (intent.submittedMonths.length > 0) {
    return "по дате подачи";
  }
  return "по заданным фильтрам";
}

export function sortClientsForStructuredList(
  clients: ResolvedClientContext[],
): ResolvedClientContext[] {
  return [...clients].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
    if (byName !== 0) return byName;
    const bySource = a.sourceLabel.localeCompare(b.sourceLabel, "ru");
    if (bySource !== 0) return bySource;
    return (a.rowIndex ?? 0) - (b.rowIndex ?? 0);
  });
}

/** Count rendered numbered rows in a list reply (1. …). */
export function countRenderedListRows(reply: string): number {
  const matches = reply.match(/^\s*\d+\.\s+/gm);
  return matches?.length ?? 0;
}

export function parseReportedListCount(reply: string): number | null {
  const found = reply.match(/Найдено\s+(\d+)/i);
  if (found?.[1]) return Number(found[1]);
  const total = reply.match(/Всего:\s*(\d+)/i);
  if (total?.[1]) return Number(total[1]);
  const shown = reply.match(/Показано\s+\d+\s+из\s+(\d+)/i);
  if (shown?.[1]) return Number(shown[1]);
  return null;
}

export function formatStructuredClientListReply(params: {
  clients: ResolvedClientContext[];
  totalFound: number;
  filterLabel: string;
  sourceQuery: string;
  offset?: number;
  pageSize?: number;
}): {
  reply: string;
  continuation: ClientListContinuationState | null;
  renderedCount: number;
  reportedCount: number;
} {
  const offset = Math.max(0, params.offset ?? 0);
  const pageSize = Math.max(1, params.pageSize ?? LIST_QUERY_PAGE_SIZE);
  // Always trust the current resolved set size — never client-supplied totals.
  const totalFound = Math.max(0, params.totalFound);
  const sorted = sortClientsForStructuredList(params.clients);
  const page = sorted.slice(offset, offset + pageSize);
  const reportedCount = totalFound;

  if (totalFound === 0) {
    const reply = `По фильтру ${params.filterLabel} ничего не найдено в таблицах «Клиенты» и «Новые клиенты».`;
    return {
      reply,
      continuation: null,
      renderedCount: 0,
      reportedCount: 0,
    };
  }

  if (page.length === 0 || offset >= totalFound) {
    const reply = `Список ${params.filterLabel} уже показан полностью (всего ${totalFound}).`;
    return {
      reply,
      continuation: null,
      renderedCount: 0,
      reportedCount: totalFound,
    };
  }

  const sourcesPresent = new Set(
    page.flatMap((client) => {
      if (isMergedClientContext(client)) {
        return client.parts.map((part) => part.sourceLabel);
      }
      return [client.sourceLabel];
    }),
  );
  const sourceNote =
    sourcesPresent.size > 0
      ? ` Источники: ${[...sourcesPresent].join(", ")}.`
      : "";

  const lines = page.map((client, index) => {
    const n = offset + index + 1;
    return `${n}. ${client.name} — ${displayStatus(client.status)} — ${displayManager(client.manager)}`;
  });

  const shownThrough = offset + page.length;
  const needsPagination = shownThrough < totalFound;
  const header =
    offset === 0
      ? `Найдено ${totalFound} клиентов и заявок ${params.filterLabel}.${sourceNote}`
      : `Продолжение списка ${params.filterLabel}: записи ${offset + 1}–${shownThrough} из ${totalFound}.${sourceNote}`;

  const footerParts = [`Всего: ${totalFound}`];
  if (needsPagination) {
    footerParts.unshift(
      `Показано ${shownThrough} из ${totalFound}. Напишите «следующие», чтобы продолжить с того же фильтра.`,
    );
  }

  const reply = [header, "", ...lines, "", ...footerParts].join("\n");

  return {
    reply,
    continuation: needsPagination
      ? {
          sourceQuery: params.sourceQuery,
          offset: shownThrough,
          total: totalFound,
          filterSummary: params.filterLabel,
        }
      : null,
    renderedCount: page.length,
    reportedCount,
  };
}

export function findPriorStructuredListUserQuery(
  history: Array<{ role: string; content: string }>,
): string | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i];
    if (turn.role !== "user") continue;
    if (isClientListContinuationQuery(turn.content)) continue;
    // Only resume a true list intent — never singular «клиент X» lookups.
    if (
      isClientListQuery(turn.content) ||
      parseClientSearchIntentRules(turn.content).isListQuery
    ) {
      return turn.content.trim();
    }
  }
  return null;
}

/** True when an assistant turn still looks like a structured client-list page. */
export function looksLikeStructuredClientListReply(reply: string): boolean {
  return (
    /Найдено\s+\d+\s+клиент/i.test(reply) ||
    /Показано\s+\d+\s+из\s+\d+/i.test(reply) ||
    /Продолжение списка/i.test(reply) ||
    /Всего:\s*\d+/i.test(reply)
  );
}

/**
 * Text-history fallback for old conversations without structured meta.
 * Requires the latest assistant turn to still be a list page so unrelated
 * answers (weather, singular lookup, KB) do not resume pagination.
 */
export function resolveTextFallbackListContinuation(
  history: Array<{ role: string; content: string }>,
  userMessage: string,
): { sourceQuery: string; offset: number } | null {
  if (!isClientListContinuationQuery(userMessage)) return null;
  const lastAssistant = [...history]
    .reverse()
    .find((turn) => turn.role === "assistant");
  if (
    !lastAssistant ||
    !looksLikeStructuredClientListReply(lastAssistant.content)
  ) {
    return null;
  }
  const sourceQuery = findPriorStructuredListUserQuery(history);
  if (!sourceQuery) return null;
  return {
    sourceQuery,
    offset: parseListOffsetFromAssistantReply(lastAssistant.content),
  };
}

export function parseListOffsetFromAssistantReply(reply: string): number {
  const shown = reply.match(/Показано\s+(\d+)\s+из\s+\d+/i);
  if (shown?.[1]) return Number(shown[1]);
  const range = reply.match(/записи\s+\d+[–-]+(\d+)\s+из/i);
  if (range?.[1]) return Number(range[1]);
  const nums = [...reply.matchAll(/^\s*(\d+)\.\s+/gm)].map((m) => Number(m[1]));
  if (nums.length > 0) return Math.max(...nums);
  return 0;
}

/** Ensure list replies never embed sensitive CRM secrets. */
export function listReplyContainsSensitiveLeak(reply: string): boolean {
  return /appPassword|пароль\s+для\s+приложения\s*[:=]|api[_-]?key\s*[:=]/i.test(
    reply,
  );
}
