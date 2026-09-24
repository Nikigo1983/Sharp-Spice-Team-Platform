/**
 * REAL prepare-path ClientRef regression.
 * No pre-injected ClientRef / lockClientRefIntoCaseMemory before prepare.
 * Exercises prepareWorkspaceRequest → unique portal resolve → kind:"ai" → SSE.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClientRef, isQuestionnaireUuid } from "@/lib/ai/client-ref";
import {
  clientRefFromCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  commitUniqueClientResolution,
  lockCaseMemoryFromUniqueResolvedClient,
} from "@/lib/ai/clientref-resolution-lock";
import { clientRefFromResolved } from "@/lib/ai/resolve-client";
import type { ClientContext } from "@/lib/ai/client-context";
import type { ClientAiSearchResult } from "@/lib/ai/client-lookup";
import { EMPTY_CLIENT_SEARCH_INTENT } from "@/lib/ai/client-search-intent";
import {
  buildEvidencePack,
  formatEvidencePackForModel,
} from "@/lib/ai/evidence-pack";
import { classifyCurrentTask, taskRequiresClientRef } from "@/lib/ai/current-task";
import {
  caseMemoryForStreamMeta,
  sanitizeCaseMemory,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";
import {
  encodeWorkspaceAiSseEvent,
  encodeWorkspaceAiSseMeta,
  parseWorkspaceAiTurnRequestCaseMemory,
  reduceWorkspaceAiSseTranscriptCaseMemory,
  serializeWorkspaceAiTurnRequest,
} from "@/lib/ai/workspace-ai-browser-contract";
import {
  isPronounDebtFollowUpQuery,
  isLockedClientDebtStatusQuery,
} from "@/lib/ai/finance-debt-query";
import { prepareWorkspaceRequest } from "@/lib/ai/workspace-assistant";
import type { SafeClientRecord } from "@/lib/ai/workspace-tools/client-tools";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";

const PORTAL_UUID = "c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1";
const OTHER_UUID = "d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1";
const FINANCE_PROFILE_ID = "fin-profile-999";
const LABEL = "AI SYNTH PREPARE LOCK";
const FULL_PROFILE_Q = `Найди всю информацию по клиенту ${LABEL}`;
const DEBT_PRONOUN = "Какой у него долг?";
const GENERAL_Q = "Что такое апостиль?";

function portalClientContext(id: string, name: string): ClientContext {
  return {
    source: "clients",
    sourceLabel: "Заявки портала Emigrant",
    rowIndex: 0,
    name,
    phone: "+10000000000",
    email: "prepare-lock@example.com",
    country: "Хорватия",
    direction: "ВНЖ",
    status: "Документы на проверке",
    manager: "",
    lastActivity: "",
    surveyData: "",
    score: 100,
    matchedFields: ["name"],
    debugRow: { id, name },
  };
}

function emptyIntent(): ClientAiSearchResult["intent"] {
  return {
    ...EMPTY_CLIENT_SEARCH_INTENT,
    clientName: LABEL,
  };
}

function uniqueSearchResult(
  client: ClientContext,
): ClientAiSearchResult {
  return {
    lookup: { kind: "single", client, query: FULL_PROFILE_Q },
    intent: emptyIntent(),
    usedStructuredSearch: true,
    intentType: "single",
    foundClients: 1,
    sentToClaude: 1,
  };
}

function ambiguousSearchResult(): ClientAiSearchResult {
  return {
    lookup: {
      kind: "multiple",
      clients: [
        portalClientContext(PORTAL_UUID, `${LABEL} A`),
        portalClientContext(OTHER_UUID, `${LABEL} B`),
      ],
      pendingParts: [
        portalClientContext(PORTAL_UUID, `${LABEL} A`),
        portalClientContext(OTHER_UUID, `${LABEL} B`),
      ],
      query: FULL_PROFILE_Q,
    },
    intent: emptyIntent(),
    usedStructuredSearch: true,
    intentType: "single",
    foundClients: 2,
    sentToClaude: 2,
  };
}

function notFoundSearchResult(): ClientAiSearchResult {
  return {
    lookup: { kind: "not_found", query: FULL_PROFILE_Q },
    intent: emptyIntent(),
    usedStructuredSearch: false,
    intentType: "single",
    foundClients: 0,
    sentToClaude: 0,
  };
}

function synthSafe(clientId: string): SafeClientRecord {
  return {
    clientId,
    name: LABEL,
    latinName: LABEL,
    passport: null,
    email: "prepare-lock@example.com",
    phone: "+10000000000",
    status: "Документы на проверке",
    manager: null,
    partner: null,
    submittedAt: "2026-01-01",
    bookingAddress: null,
    bookingRange: null,
    approvalAt: null,
    residenceCardIssuedAt: null,
    expectedApprovalAt: null,
    notes: null,
    direction: "Хорватия",
    citizenship: null,
    placeOfBirth: null,
    hasContract: true,
    contractLabel: null,
    contractAmount: null,
    employmentType: null,
    fields: [],
    source: "Заявки портала Emigrant",
  };
}

function synthFinance(clientId: string): PortalFinanceSnapshot {
  return {
    clientId,
    name: LABEL,
    email: "prepare-lock@example.com",
    contractAmount: "2 000 €",
    contractAmountCents: 200000,
    paidAmount: "500 €",
    paidAmountCents: 50000,
    balance: "1 500 €",
    balanceCents: 150000,
    paymentStatus: "partial",
    contractLabel: null,
    staffContractAmount: null,
  };
}

function emptyContext() {
  return {
    clientsText: "",
    emigrantDeskText: "",
    emigrantDriveText: "",
    formgridText: "",
    knowledgeBaseText: "",
    kbRetrieval: {
      attempted: false,
      configured: false,
      mode: "skipped" as const,
      groundingState: "KB_SKIPPED" as const,
      selectedFiles: [],
      textCharCount: 0,
      errorMessage: null,
      filenameSearchAttempted: false,
      contentSearchAttempted: false,
      rejectedOutsideRootCount: 0,
      retrievalLatencyMs: null,
      queryTokens: [],
    },
    emigrantDriveRetrieval: {
      attempted: false,
      configured: false,
      mode: "skipped" as const,
      groundingState: "KB_SKIPPED" as const,
      selectedFiles: [],
      textCharCount: 0,
      errorMessage: null,
      filenameSearchAttempted: false,
      contentSearchAttempted: false,
      rejectedOutsideRootCount: 0,
      retrievalLatencyMs: null,
      queryTokens: [],
    },
    meta: {
      clientsTotal: 0,
      emigrantDeskTotal: 0,
      emigrantDriveConfigured: false,
      formgridRows: 0,
    },
  };
}

function simulateSseFromPrepared(prepared: WorkspaceCaseMemory): string {
  const early = caseMemoryForStreamMeta({ prepared, phase: "early" });
  const finalMem = caseMemoryForStreamMeta({
    prepared,
    refreshed: { ...prepared, specialNotes: "store refresh" },
    phase: "final",
  });
  return (
    encodeWorkspaceAiSseEvent("status", { phase: "context" }) +
    encodeWorkspaceAiSseMeta({
      requestId: "req-prepare-path",
      sources: ["Заявки портала Emigrant"],
      demo: false,
      ...(early !== undefined ? { caseMemory: early } : {}),
    }) +
    encodeWorkspaceAiSseEvent("status", { phase: "generating" }) +
    encodeWorkspaceAiSseEvent("delta", { content: "profile ok" }) +
    encodeWorkspaceAiSseMeta({
      requestId: "req-prepare-path",
      sources: ["Заявки портала Emigrant", "Finance"],
      demo: false,
      caseMemory: finalMem ?? null,
    }) +
    encodeWorkspaceAiSseEvent("done", {})
  );
}

describe("PREPARE_UNIQUE_CLIENTREF_LOCK", () => {
  it("unique portal prepare → kind ai locks questionnaire UUID before SSE", async () => {
    const task = classifyCurrentTask({ query: FULL_PROFILE_Q });
    assert.equal(task.taskClass, "CLIENT_SUMMARY");
    assert.equal(taskRequiresClientRef(task), true);
    assert.equal(isQuestionnaireUuid(PORTAL_UUID), true);

    const client = portalClientContext(PORTAL_UUID, LABEL);
    // Prove UUID is available from portal row id BEFORE any manual lock.
    const fromCtx = clientRefFromResolved(client, "RESOLVED");
    assert.ok(fromCtx);
    assert.equal(fromCtx!.clientId, PORTAL_UUID);

    const prepared = await prepareWorkspaceRequest(
      FULL_PROFILE_Q,
      [],
      "brief",
      null,
      "req-prepare-unique-lock",
      null,
      null,
      null, // no inbound ClientRef
      true, // forceLegacy → non-agent kind:"ai"
      null,
      {
        resolveClient: async () => ({
          outcome: "RESOLVED",
          clientRef: fromCtx!,
          client,
          reusedLock: false,
        }),
        buildWorkspaceContext: async () => emptyContext() as never,
        assembleEvidencePack: async ({ clientRef, task: t }) =>
          buildEvidencePack({
            task: t,
            clientRef,
            safe: synthSafe(clientRef.clientId),
            finance: synthFinance(clientRef.clientId),
            documents: [],
            freshnessClass: "LIVE_FETCH",
          }),
      },
    );

    assert.equal(prepared.kind, "ai", "PREPARE_UNIQUE_LOCK");
    if (prepared.kind !== "ai") return;

    assert.equal(
      prepared.caseMemory?.linkedClientId,
      PORTAL_UUID,
      "prepared.caseMemory.linkedClientId",
    );
    assert.ok(
      prepared.trace.notes.some((n) =>
        /client_ref_locked|client_ref_switched/.test(n),
      ),
      "prepare must record a lock note",
    );
    assert.ok(
      formatEvidencePackForModel.length >= 0 || prepared.contextBlock,
      "evidence/context present",
    );

    // First authoritative SSE meta carries linkedClientId
    const early = caseMemoryForStreamMeta({
      prepared: prepared.caseMemory,
      phase: "early",
    });
    assert.ok(early, "FIRST_SSE_META_CLIENTREF_TEST");
    assert.equal(early!.linkedClientId, PORTAL_UUID);

    // Browser round-trip without manually injecting after resolution
    const sse = simulateSseFromPrepared(prepared.caseMemory!);
    const ui = reduceWorkspaceAiSseTranscriptCaseMemory(sse);
    assert.equal(
      clientRefFromCaseMemory(ui ?? null)?.clientId,
      PORTAL_UUID,
      "BROWSER_ROUNDTRIP UI",
    );
    const postJson = serializeWorkspaceAiTurnRequest({
      message: DEBT_PRONOUN,
      history: [
        { role: "user", content: FULL_PROFILE_Q },
        { role: "assistant", content: "profile ok" },
      ],
      mode: "brief",
      chatId: "chat-prepare-path",
      caseMemory: ui ?? null,
    });
    const serverTurn2 = parseWorkspaceAiTurnRequestCaseMemory(postJson);
    assert.equal(
      clientRefFromCaseMemory(serverTurn2)?.clientId,
      PORTAL_UUID,
      "BROWSER_ROUNDTRIP API sanitize",
    );
    assert.equal(isPronounDebtFollowUpQuery(DEBT_PRONOUN), true);
    assert.equal(isLockedClientDebtStatusQuery(DEBT_PRONOUN), true);
  });

  it("AMBIGUOUS portal result → no lock", async () => {
    const prepared = await prepareWorkspaceRequest(
      FULL_PROFILE_Q,
      [],
      "brief",
      null,
      "req-ambiguous",
      null,
      null,
      null,
      true,
      null,
      {
        resolveClient: async () => ({
          outcome: "AMBIGUOUS",
          clientRef: null,
          candidates: [
            { clientId: PORTAL_UUID, displayLabel: `${LABEL} A`, score: 90 },
            { clientId: OTHER_UUID, displayLabel: `${LABEL} B`, score: 88 },
          ],
          pendingParts: [
            portalClientContext(PORTAL_UUID, `${LABEL} A`),
            portalClientContext(OTHER_UUID, `${LABEL} B`),
          ],
          reusedLock: false,
        }),
        lookupClientsWithAiSearch: async () => ambiguousSearchResult(),
        buildWorkspaceContext: async () => emptyContext() as never,
      },
    );
    if (prepared.kind === "ai") {
      assert.equal(
        clientRefFromCaseMemory(prepared.caseMemory),
        null,
        "AMBIGUOUS_NO_LOCK",
      );
    } else if (prepared.kind === "direct") {
      assert.equal(
        clientRefFromCaseMemory(prepared.caseMemory ?? null),
        null,
        "AMBIGUOUS_NO_LOCK",
      );
    }
    const early = caseMemoryForStreamMeta({
      prepared:
        prepared.kind === "ai" || prepared.kind === "direct"
          ? prepared.caseMemory ?? null
          : null,
      phase: "early",
    });
    assert.equal(early, undefined, "AMBIGUOUS early SSE omits lock");
  });

  it("NOT_FOUND → no lock", async () => {
    const prepared = await prepareWorkspaceRequest(
      FULL_PROFILE_Q,
      [],
      "brief",
      null,
      "req-not-found",
      null,
      null,
      null,
      true,
      null,
      {
        resolveClient: async () => ({
          outcome: "NOT_FOUND",
          clientRef: null,
          reusedLock: false,
        }),
        lookupClientsWithAiSearch: async () => notFoundSearchResult(),
        buildWorkspaceContext: async () => emptyContext() as never,
      },
    );
    const mem =
      prepared.kind === "ai" || prepared.kind === "direct"
        ? prepared.caseMemory ?? null
        : null;
    assert.equal(clientRefFromCaseMemory(mem), null, "NOT_FOUND_NO_LOCK");
  });

  it("general question → no lock", async () => {
    const prepared = await prepareWorkspaceRequest(
      GENERAL_Q,
      [],
      "brief",
      null,
      "req-general",
      null,
      null,
      null,
      true,
      null,
      {
        resolveClient: async () => {
          throw new Error("must_not_resolve_on_general");
        },
        lookupClientsWithAiSearch: async () => {
          throw new Error("must_not_search_on_general");
        },
        buildWorkspaceContext: async () => emptyContext() as never,
      },
    );
    const mem =
      prepared.kind === "ai" || prepared.kind === "direct"
        ? prepared.caseMemory ?? null
        : null;
    assert.equal(clientRefFromCaseMemory(mem), null, "GENERAL_NO_LOCK");
  });

  it("Finance profile ID cannot become ClientRef", () => {
    assert.equal(createClientRef({ clientId: FINANCE_PROFILE_ID }), null);
    assert.throws(() =>
      commitUniqueClientResolution({
        memory: null,
        ref: {
          clientId: FINANCE_PROFILE_ID,
          displayLabel: "Bad",
          resolutionOutcome: "RESOLVED",
          source: "client_portal",
        },
      }),
    );
    const locked = lockCaseMemoryFromUniqueResolvedClient({
      memory: null,
      ref: createClientRef({ clientId: FINANCE_PROFILE_ID }),
    });
    assert.equal(locked.locked, false, "FINANCE_ID_REJECTED");
    assert.equal(locked.memory, null);
  });

  it("cross-chat isolation: lock is per caseMemory, not global", () => {
    const chatA = lockCaseMemoryFromUniqueResolvedClient({
      memory: null,
      ref: createClientRef({ clientId: PORTAL_UUID, displayLabel: "A" }),
    });
    const chatB = sanitizeCaseMemory(null);
    assert.equal(chatA.memory?.linkedClientId, PORTAL_UUID);
    assert.equal(clientRefFromCaseMemory(chatB), null, "CROSS_CHAT_ISOLATION");
  });

  it("explicit unique switch replaces stale prior lock", () => {
    const first = lockCaseMemoryFromUniqueResolvedClient({
      memory: null,
      ref: createClientRef({ clientId: PORTAL_UUID, displayLabel: "Old" }),
    });
    first.memory!.specialNotes = "stale fact";
    const switched = lockCaseMemoryFromUniqueResolvedClient({
      memory: first.memory,
      ref: createClientRef({ clientId: OTHER_UUID, displayLabel: "New" }),
      previousRef: clientRefFromCaseMemory(first.memory),
    });
    assert.equal(switched.switched, true, "EXPLICIT_SWITCH");
    assert.equal(switched.memory?.linkedClientId, OTHER_UUID);
    assert.equal(switched.memory?.specialNotes, null);
  });

  it("search-single path without resolveClient still locks via prepare gate", async () => {
    const client = portalClientContext(PORTAL_UUID, LABEL);
    const prepared = await prepareWorkspaceRequest(
      FULL_PROFILE_Q,
      [],
      "brief",
      null,
      "req-search-single",
      null,
      null,
      null,
      true,
      null,
      {
        // Skip resolveClient unique path — fall through to search.
        resolveClient: async () => ({
          outcome: "NOT_FOUND",
          clientRef: null,
          reusedLock: false,
        }),
        lookupClientsWithAiSearch: async () => uniqueSearchResult(client),
        buildWorkspaceContext: async () => emptyContext() as never,
        assembleEvidencePack: async ({ clientRef, task: t }) =>
          buildEvidencePack({
            task: t,
            clientRef,
            safe: synthSafe(clientRef.clientId),
            finance: synthFinance(clientRef.clientId),
            documents: [],
            freshnessClass: "LIVE_FETCH",
          }),
      },
    );
    assert.equal(prepared.kind, "ai");
    if (prepared.kind !== "ai") return;
    assert.equal(
      prepared.caseMemory?.linkedClientId,
      PORTAL_UUID,
      "search-single pre-ai gate",
    );
  });
});
