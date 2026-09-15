/**
 * Canonical resolve_client façade (Phase 1).
 * Portal questionnaires are client truth; never silently pick among ambiguous.
 */

import {
  createClientRef,
  isQuestionnaireUuid,
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
import { morphNameMatch } from "@/lib/ai/russian-name-morphology";
import { isPronounDebtFollowUpQuery } from "@/lib/ai/finance-debt-query";

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
      if (id && isQuestionnaireUuid(id)) return id;
    }
    return null;
  }
  const id = client.debugRow?.id?.trim() || null;
  return id && isQuestionnaireUuid(id) ? id : null;
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
 * Detect whether the user is naming a different client than the lock.
 * Conservative: only switch when an extracted entity clearly mismatches.
 */
export function querySuggestsDifferentClient(
  query: string,
  locked: ClientRef | null | undefined,
): boolean {
  if (!locked?.displayLabel) return false;
  // Pronoun debt/status follow-ups never name a new client.
  if (isPronounDebtFollowUpQuery(query)) return false;
  const extraction = extractClientEntityFromQuery(query);
  const phrase =
    extraction?.searchPhrase?.trim() ||
    extraction?.extractedPhrase?.trim() ||
    "";
  if (!phrase || phrase.length < 3) return false;
  // Same family / morph match → keep lock.
  if (morphNameMatch(locked.displayLabel, phrase)) return false;
  if (morphNameMatch(phrase, locked.displayLabel)) return false;
  // Explicit other surname-like token.
  return true;
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
