/**
 * Canonical resolve_client façade (Phase 1).
 * Portal questionnaires are client truth; never silently pick among ambiguous.
 */

import {
  createClientRef,
  isCanonicalQuestionnaireId,
  type ClientRef,
  type ClientResolutionOutcome,
} from "@/lib/ai/client-ref";
import {
  lookupClientsWithAiSearch,
  type ClientAiSearchResult,
} from "@/lib/ai/client-lookup";
import {
  isMergedClientContext,
  type ClientContext,
  type ResolvedClientContext,
} from "@/lib/ai/client-context";
import { resolveClientSelectionFollowUp } from "@/lib/ai/client-selection-followup";
import { extractClientEntityFromQuery } from "@/lib/ai/client-entity-extract";
import { extractClientNameFromLetterQuery } from "@/lib/ai/client-debt-letter";
import { morphNameMatch } from "@/lib/ai/russian-name-morphology";
import {
  extractNameFromDebtQuery,
  isPronounDebtFollowUpQuery,
} from "@/lib/ai/finance-debt-query";

type ChatTurn = { role: "user" | "assistant"; content: string };

export type ResolveClientCandidate = {
  clientId: string | null;
  displayLabel: string;
  score?: number;
};

export type ResolveClientResult =
  | {
      outcome: "RESOLVED" | "RESOLVED_LOCKED";
      clientRef: ClientRef;
      client: ResolvedClientContext | null;
      reusedLock: boolean;
    }
  | {
      outcome: "AMBIGUOUS";
      clientRef: null;
      candidates: ResolveClientCandidate[];
      pendingParts: ClientContext[];
      reusedLock: boolean;
    }
  | {
      outcome: "NOT_FOUND";
      clientRef: null;
      reusedLock: boolean;
    }
  | {
      outcome: "NOT_REQUIRED";
      clientRef: ClientRef | null;
      reusedLock: boolean;
    };

function clientIdFromResolved(
  client: ResolvedClientContext,
): string | null {
  if (isMergedClientContext(client)) {
    for (const part of client.parts) {
      const id = part.debugRow?.id?.trim();
      if (id && isCanonicalQuestionnaireId(id)) return id;
    }
    return null;
  }
  const id = client.debugRow?.id?.trim() || null;
  return id && isCanonicalQuestionnaireId(id) ? id : null;
}

export function clientRefFromResolved(
  client: ResolvedClientContext,
  outcome: ClientResolutionOutcome = "RESOLVED",
): ClientRef | null {
  const clientId = clientIdFromResolved(client);
  if (!clientId) return null;
  return createClientRef({
    clientId,
    displayLabel: client.name,
    resolutionOutcome: outcome,
  });
}

/**
 * Positive person-name signal (not a stopword blacklist).
 * Blocks weak instruction nouns after «клиенту …» from overriding a lock.
 */
export function looksLikePersonName(phrase: string): boolean {
  const tokens = phrase
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[,.!?«»"']+|[,.!?«»"']+$/g, ""))
    .filter(Boolean);
  if (tokens.length === 0) return false;
  const isAlphaToken = (t: string) =>
    t.length >= 2 && /^[\p{L}][\p{L}'\u2019-]*$/u.test(t);
  if (!tokens.every(isAlphaToken)) return false;
  // Multi-token identity (e.g. AI SYNTH BETA KAPLAN, Имя Фамилия).
  if (tokens.length >= 2) return true;
  const t = tokens[0]!;
  if (t.length < 4) return false;
  // Title-case / Latin capital proper name.
  if (/^[A-ZÀ-ÖØ-Þ]/.test(t)) return true;
  if (/^[А-ЯЁ]/.test(t)) return true;
  // Lowercase Cyrillic surname morphology (common RU manager phrasing).
  if (
    t.length >= 5 &&
    /(?:ова|ева|ёва|ина|ына|ская|цкая|ский|цкий|енко|ук|юк)$/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Explicit different-client / switch identity only.
 * Weak entity extraction alone must not override a valid ClientRef lock.
 */
export function extractExplicitDifferentClientPhrase(
  query: string,
): string | null {
  const strong = extractStrongExplicitClientPhrase(query);
  if (strong) return strong;

  const extraction = extractClientEntityFromQuery(query);
  const phrase =
    extraction?.searchPhrase?.trim() ||
    extraction?.extractedPhrase?.trim() ||
    "";
  if (phrase && looksLikePersonName(phrase)) return phrase;
  return null;
}

/**
 * Strong, deterministic client-identity phrasing (switch / letter / debt name /
 * «клиенту …»). Excludes weak generic entity extraction — used when the lock
 * has no displayLabel so we cannot morph-compare same vs different client.
 */
export function extractStrongExplicitClientPhrase(
  query: string,
): string | null {
  const q = query.trim();
  if (!q) return null;

  const fromLetter = extractClientNameFromLetterQuery(q);
  if (fromLetter && looksLikePersonName(fromLetter)) return fromLetter.trim();

  const fromDebt = extractNameFromDebtQuery(q);
  if (fromDebt && looksLikePersonName(fromDebt)) return fromDebt.trim();

  const explicitPatterns: RegExp[] = [
    /переключ\w*\s+(?:на\s+)?(?:клиента?\s+)?(.+?)(?:\s*[.?!]|$)/iu,
    /смени(?:ть)?\s+(?:на\s+)?(?:клиента?\s+)?(.+?)(?:\s*[.?!]|$)/iu,
    /switch\s+to(?:\s+client)?\s+(.+?)(?:\s*[.?!]|$)/iu,
    /(?:^|[\s,.;])(?:для|к)\s+([A-Za-zА-ЯЁа-яё][\p{L}'\u2019-]*(?:\s+[A-Za-zА-ЯЁа-яё][\p{L}'\u2019-]*){0,5})/u,
    /(?:по\s+)?клиент(?:ка|ки|ку|ке|ом|у|а|ов)?\s+([A-ZА-ЯЁ][\p{L}'\u2019-]*(?:\s+[A-Za-zА-ЯЁа-яё][\p{L}'\u2019-]*){0,5})/u,
  ];
  for (const pattern of explicitPatterns) {
    const match = q.match(pattern);
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    const cleaned = raw.replace(/^(?:клиента?|client)\s+/iu, "").trim();
    if (cleaned && looksLikePersonName(cleaned)) return cleaned;
  }
  return null;
}

/**
 * Detect whether the user is naming a different client than the lock.
 * Default with a valid lock: reuse. Override only on explicit mismatch.
 *
 * Id-only locks (questionnaire UUID without displayLabel) are valid.
 * Missing displayLabel must NOT make the lock immutable: a strong explicit
 * client-lookup phrase still allows the resolver to run. Pronoun / weak /
 * general messages continue to reuse the lock.
 */
export function querySuggestsDifferentClient(
  query: string,
  locked: ClientRef | null | undefined,
): boolean {
  if (!locked) return false;
  // Pronoun debt/status follow-ups never name a new client.
  if (isPronounDebtFollowUpQuery(query)) return false;

  const label = locked.displayLabel?.trim() || "";
  if (!label) {
    // Cannot morph-compare: only strong client-lookup/switch phrasing may
    // reopen resolve. Do not use weak entity extraction alone.
    const strong = extractStrongExplicitClientPhrase(query);
    return Boolean(strong && strong.length >= 3);
  }

  const phrase = extractExplicitDifferentClientPhrase(query);
  if (!phrase || phrase.length < 3) return false;
  // Same family / morph match → keep lock.
  if (morphNameMatch(label, phrase)) return false;
  if (morphNameMatch(phrase, label)) return false;
  return true;
}

/** Explicit switch command — may resolve even when CurrentTask is non-client. */
export function isExplicitClientSwitchCommand(query: string): boolean {
  return /переключ\w*|смени(?:ть)?\s+(?:на\s+)?(?:клиента?\s+)?|switch\s+to(?:\s+client)?/i.test(
    query.trim(),
  );
}

/**
 * Gate for portal client resolution.
 * Generic entity extraction must NOT trigger resolve when the task does not
 * require a ClientRef and the user is not explicitly switching clients.
 */
export function shouldAttemptClientResolve(params: {
  followUp: boolean;
  isListLike: boolean;
  taskRequiresClientRef: boolean;
  needsClients: boolean;
  fastClientLookup: boolean;
  isDocFill: boolean;
  query: string;
}): boolean {
  if (params.followUp || params.isListLike) return false;
  if (params.taskRequiresClientRef) return true;
  if (params.needsClients || params.fastClientLookup) return true;
  if (params.isDocFill) return true;
  if (isExplicitClientSwitchCommand(params.query)) return true;
  return false;
}

export type ResolveClientParams = {
  query: string;
  lockedClientRef?: ClientRef | null;
  pendingCandidates?: ClientContext[] | null;
  history?: ChatTurn[];
  /** When true, skip reuse and always run search. */
  forceResolve?: boolean;
  /** Skip resolution entirely (transform / knowledge). */
  skipResolve?: boolean;
  /** Injected search for tests. */
  searchFn?: (query: string) => Promise<ClientAiSearchResult>;
};

/**
 * Single Workspace resolve path → ClientRef | ambiguous | not found.
 */
export async function resolveClient(
  params: ResolveClientParams,
): Promise<ResolveClientResult> {
  const locked = params.lockedClientRef ?? null;

  if (params.skipResolve) {
    return {
      outcome: "NOT_REQUIRED",
      clientRef: locked
        ? { ...locked, resolutionOutcome: "RESOLVED_LOCKED" }
        : null,
      reusedLock: Boolean(locked),
    };
  }

  const followUp = resolveClientSelectionFollowUp(
    params.query,
    params.pendingCandidates ?? null,
    params.history ?? [],
  );
  if (followUp?.kind === "select") {
    const ref = clientRefFromResolved(followUp.client, "RESOLVED");
    if (ref) {
      return {
        outcome: "RESOLVED",
        clientRef: ref,
        client: followUp.client,
        reusedLock: false,
      };
    }
  }

  if (
    locked &&
    !params.forceResolve &&
    !querySuggestsDifferentClient(params.query, locked)
  ) {
    return {
      outcome: "RESOLVED_LOCKED",
      clientRef: { ...locked, resolutionOutcome: "RESOLVED_LOCKED" },
      client: null,
      reusedLock: true,
    };
  }

  const search = params.searchFn ?? lookupClientsWithAiSearch;
  const result = await search(params.query);
  const lookup = result.lookup;

  if (lookup.kind === "single") {
    const ref = clientRefFromResolved(lookup.client, "RESOLVED");
    if (!ref) {
      return { outcome: "NOT_FOUND", clientRef: null, reusedLock: false };
    }
    return {
      outcome: "RESOLVED",
      clientRef: ref,
      client: lookup.client,
      reusedLock: false,
    };
  }

  if (lookup.kind === "multiple" || lookup.kind === "weak") {
    const clients =
      lookup.kind === "multiple" || lookup.kind === "weak"
        ? lookup.clients
        : [];
    const pendingParts =
      lookup.kind === "multiple"
        ? lookup.pendingParts
        : clients.flatMap((c) =>
            isMergedClientContext(c) ? c.parts : [c],
          );
    return {
      outcome: "AMBIGUOUS",
      clientRef: null,
      candidates: clients.map((c) => ({
        clientId: clientIdFromResolved(c),
        displayLabel: c.name,
        score: c.score,
      })),
      pendingParts,
      reusedLock: false,
    };
  }

  if (lookup.kind === "not_found") {
    return { outcome: "NOT_FOUND", clientRef: null, reusedLock: false };
  }

  // skip
  if (locked) {
    return {
      outcome: "RESOLVED_LOCKED",
      clientRef: { ...locked, resolutionOutcome: "RESOLVED_LOCKED" },
      client: null,
      reusedLock: true,
    };
  }

  return {
    outcome: "NOT_REQUIRED",
    clientRef: null,
    reusedLock: false,
  };
}

/** Map resolve outcome to Phase 0 trace enum. */
export function toTraceClientResolutionOutcome(
  outcome: ResolveClientResult["outcome"],
): "RESOLVED" | "AMBIGUOUS" | "NOT_FOUND" | "NOT_REQUIRED" | "UNKNOWN" {
  if (outcome === "RESOLVED" || outcome === "RESOLVED_LOCKED") return "RESOLVED";
  if (outcome === "AMBIGUOUS") return "AMBIGUOUS";
  if (outcome === "NOT_FOUND") return "NOT_FOUND";
  if (outcome === "NOT_REQUIRED") return "NOT_REQUIRED";
  return "UNKNOWN";
}
