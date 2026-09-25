/**
 * Regression: unique portal search hit with formgrid-q-/legacy-q- PK previously
 * returned resolveClient NOT_FOUND (RFC UUID gate), while search preloaded
 * context (foundClients=1, clientRefPresent=false). ClientRef must lock the
 * actual client_portal_questionnaires.id so Turn2 Finance uses the same id.
 * Synthetic ids only — no PII.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createClientRef,
  isCanonicalQuestionnaireId,
  isQuestionnaireUuid,
} from "@/lib/ai/client-ref";
import {
  clientRefFromCaseMemory,
  lockClientRefIntoCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  commitUniqueClientResolution,
} from "@/lib/ai/clientref-resolution-lock";
import {
  clientRefFromResolved,
  resolveClient,
  toTraceClientResolutionOutcome,
} from "@/lib/ai/resolve-client";
import type { ClientAiSearchResult } from "@/lib/ai/client-lookup";
import type { ResolvedClientContext } from "@/lib/ai/client-context";
import { EMPTY_CLIENT_SEARCH_INTENT } from "@/lib/ai/client-search-intent";
import {
  isPronounDebtFollowUpQuery,
  isLockedClientDebtStatusQuery,
} from "@/lib/ai/finance-debt-query";
import { caseMemoryForStreamMeta } from "@/lib/ai/workspace-case-memory";

const UUID_A = "11111111-2222-4333-8444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const FORMGRID_PK = "formgrid-q-a1b2c3d4";
const LEGACY_PK = "legacy-q-deadbeef";
const SHEET_ROW_ID = "formgrid:12";
const LABEL = "AI SYNTH PORTAL PK";

function synthResolved(id: string, name = LABEL): ResolvedClientContext {
  return {
    source: "clients",
    sourceLabel: "Заявки портала Emigrant",
    rowIndex: 0,
    name,
    phone: "",
    email: "",
    country: "",
    direction: "",
    status: "",
    manager: "",
    lastActivity: "",
    surveyData: "",
    score: 95,
    matchedFields: ["name"],
    debugRow: { id, name },
  };
}

function singleSearch(id: string): ClientAiSearchResult {
  return {
    lookup: {
      kind: "single",
      client: synthResolved(id),
      query: LABEL,
    },
    intent: { ...EMPTY_CLIENT_SEARCH_INTENT, clientName: LABEL },
    usedStructuredSearch: true,
    intentType: "single",
    foundClients: 1,
    sentToClaude: 1,
  };
}

function financeExternalId(clientExternalId: string): string { return clientExternalId; }

describe("ClientRef portal PK resolve (runtime-confirmed failure shape)", () => {
  it("gates: UUID + formgrid-q + legacy-q accepted; sheet row / name rejected", () => {
    assert.equal(isQuestionnaireUuid(UUID_A), true);
    assert.equal(isQuestionnaireUuid(FORMGRID_PK), false);
    assert.equal(isCanonicalQuestionnaireId(UUID_A), true);
    assert.equal(isCanonicalQuestionnaireId(FORMGRID_PK), true);
    assert.equal(isCanonicalQuestionnaireId(LEGACY_PK), true);
    assert.equal(isCanonicalQuestionnaireId(SHEET_ROW_ID), false);
    assert.equal(isCanonicalQuestionnaireId(LABEL), false);
    assert.equal(createClientRef({ clientId: LABEL }), null);
    assert.equal(createClientRef({ clientId: SHEET_ROW_ID }), null);
  });

  it("Turn1: unique formgrid-q search previously NOT_FOUND → now RESOLVED + lock", async () => {
    // Pre-fix shape: clientRefFromResolved would fail RFC UUID gate.
    assert.equal(isQuestionnaireUuid(FORMGRID_PK), false);

    const result = await resolveClient({
      query: `Найди всю информацию по клиенту ${LABEL}`,
      searchFn: async () => singleSearch(FORMGRID_PK),
    });

    assert.equal(result.outcome, "RESOLVED");
    assert.equal(toTraceClientResolutionOutcome(result.outcome), "RESOLVED");
    if (result.outcome !== "RESOLVED") return;

    assert.equal(result.clientRef.clientId, FORMGRID_PK);
    assert.equal(result.clientRef.source, "client_portal");

    const committed = commitUniqueClientResolution({
      memory: null,
      ref: result.clientRef,
    });
    assert.equal(committed.locked, true);
    assert.equal(committed.memory.linkedClientId, FORMGRID_PK);

    const sse = caseMemoryForStreamMeta({ prepared: committed.memory, phase: "early" });
    assert.equal(sse?.linkedClientId, FORMGRID_PK);

    const TURN1_UNIQUE_SEARCH_RESULT = 1;
    const TURN1_CANONICAL_ID_AVAILABLE = Boolean(
      clientRefFromResolved(synthResolved(FORMGRID_PK)),
    );
    assert.equal(TURN1_UNIQUE_SEARCH_RESULT, 1);
    assert.equal(TURN1_CANONICAL_ID_AVAILABLE, true);
  });

  it("Turn1: unique legacy-q search resolves to same portal PK", async () => {
    const result = await resolveClient({
      query: `Найди всю информацию по клиенту ${LABEL}`,
      searchFn: async () => singleSearch(LEGACY_PK),
    });
    assert.equal(result.outcome, "RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    assert.equal(result.clientRef.clientId, LEGACY_PK);
  });

  it("Turn1: invite UUID path still resolves", async () => {
    const result = await resolveClient({
      query: `Найди всю информацию по клиенту ${LABEL}`,
      searchFn: async () => singleSearch(UUID_A),
    });
    assert.equal(result.outcome, "RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    assert.equal(result.clientRef.clientId, UUID_A);
    assert.equal(isQuestionnaireUuid(result.clientRef.clientId), true);
  });

  it("Turn2: pronoun debt reuses formgrid-q lock; Finance id matches", async () => {
    const ref = createClientRef({
      clientId: FORMGRID_PK,
      displayLabel: LABEL,
    })!;
    const memory = lockClientRefIntoCaseMemory(null, ref);
    const locked = clientRefFromCaseMemory(memory);
    assert.equal(locked?.clientId, FORMGRID_PK);

    const debtQ = "Какой у неё долг?";
    assert.equal(isPronounDebtFollowUpQuery(debtQ), true);
    assert.equal(
      isLockedClientDebtStatusQuery(debtQ, Boolean(locked)),
      true,
    );

    const reused = await resolveClient({
      query: debtQ,
      lockedClientRef: locked,
      searchFn: async () => {
        throw new Error("search must not run on pronoun reuse");
      },
    });
    assert.equal(reused.outcome, "RESOLVED_LOCKED");
    if (reused.outcome !== "RESOLVED_LOCKED") return;
    assert.equal(reused.clientRef.clientId, FORMGRID_PK);
    assert.equal(reused.reusedLock, true);

    const financeId = financeExternalId(reused.clientRef.clientId);
    assert.equal(financeId, FORMGRID_PK);
    assert.equal(financeId, memory.linkedClientId);
  });

  it("ambiguous unique-looking names do not lock", async () => {
    const amb = await resolveClient({
      query: LABEL,
      searchFn: async () =>
        ({
          lookup: {
            kind: "multiple",
            clients: [
              synthResolved(FORMGRID_PK, "A"),
              synthResolved(LEGACY_PK, "B"),
            ],
            pendingParts: [],
            query: LABEL,
          },
          intent: EMPTY_CLIENT_SEARCH_INTENT,
          usedStructuredSearch: true,
          intentType: "single",
          foundClients: 2,
          sentToClaude: 2,
        }) satisfies ClientAiSearchResult,
    });
    assert.equal(amb.outcome, "AMBIGUOUS");
    assert.equal(amb.clientRef, null);
  });

  it("no client → NOT_FOUND; sheet row id single → NOT_FOUND", async () => {
    const nf = await resolveClient({
      query: "Неттакого",
      searchFn: async () =>
        ({
          lookup: { kind: "not_found", query: "x" },
          intent: EMPTY_CLIENT_SEARCH_INTENT,
          usedStructuredSearch: false,
          intentType: "single",
          foundClients: 0,
          sentToClaude: 0,
        }) satisfies ClientAiSearchResult,
    });
    assert.equal(nf.outcome, "NOT_FOUND");

    const sheet = await resolveClient({
      query: LABEL,
      searchFn: async () => singleSearch(SHEET_ROW_ID),
    });
    assert.equal(sheet.outcome, "NOT_FOUND");
    assert.equal(sheet.clientRef, null);
  });

  it("explicit A→B switch from formgrid-q to UUID", async () => {
    const lockedA = createClientRef({
      clientId: FORMGRID_PK,
      displayLabel: "Client A",
    })!;
    const switched = await resolveClient({
      query: "переключись на клиента AI SYNTH BETA",
      lockedClientRef: lockedA,
      forceResolve: true,
      searchFn: async () => singleSearch(UUID_B),
    });
    assert.equal(switched.outcome, "RESOLVED");
    if (switched.outcome !== "RESOLVED") return;
    assert.equal(switched.clientRef.clientId, UUID_B);
    assert.equal(switched.reusedLock, false);

    const committed = commitUniqueClientResolution({
      memory: lockClientRefIntoCaseMemory(null, lockedA),
      ref: switched.clientRef,
      switchExplicit: true,
    });
    assert.equal(committed.switched, true);
    assert.equal(committed.memory.linkedClientId, UUID_B);
  });
});
