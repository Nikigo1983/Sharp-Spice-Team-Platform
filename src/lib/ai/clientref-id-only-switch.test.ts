/**
 * Id-only ClientRef A → explicit B switch / follow-up / safety regressions.
 * Starts with { linkedClientId } only — no displayLabel, no clientName.
 * Exercises real resolveClient + prepareWorkspaceRequest (not applyClientSwitch shortcuts).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClientRef, isQuestionnaireUuid } from "@/lib/ai/client-ref";
import {
  clientRefFromCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  querySuggestsDifferentClient,
  resolveClient,
} from "@/lib/ai/resolve-client";
import type { ClientContext } from "@/lib/ai/client-context";
import type { ClientAiSearchResult } from "@/lib/ai/client-lookup";
import { EMPTY_CLIENT_SEARCH_INTENT } from "@/lib/ai/client-search-intent";
import {
  buildEvidencePack,
} from "@/lib/ai/evidence-pack";
import {
  caseMemoryForStreamMeta,
  sanitizeCaseMemory,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";
import {
  encodeWorkspaceAiSseEvent,
  encodeWorkspaceAiSseMeta,
  reduceWorkspaceAiSseTranscriptCaseMemory,
} from "@/lib/ai/workspace-ai-browser-contract";
import { prepareWorkspaceRequest } from "@/lib/ai/workspace-assistant";
import type { SafeClientRecord } from "@/lib/ai/workspace-tools/client-tools";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";

const UUID_A = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";
const UUID_B = "b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2";
const LABEL_A = "AI SYNTH IDONLY ALPHA";
const LABEL_B = "AI SYNTH IDONLY BETA";
const DEBT_Q = "Какой у нее долг?";
const DOCS_Q = "Покажи ее документы";
const MORE_Q = "Расскажи подробнее";
const GENERAL_Q = "Что такое апостиль?";
const PROFILE_B = `Найди всю информацию по клиенту ${LABEL_B}`;

/** Id-only lock — deliberately no clientName / displayLabel. */
function idOnlyA(): WorkspaceCaseMemory {
  const mem = sanitizeCaseMemory({
    linkedClientId: UUID_A,
  });
  assert.ok(mem);
  assert.equal(mem!.linkedClientId, UUID_A);
  assert.equal(mem!.clientName, null);
  const ref = clientRefFromCaseMemory(mem);
  assert.ok(ref);
  assert.equal(ref!.clientId, UUID_A);
  assert.equal(ref!.displayLabel, null);
  return mem!;
}

function portalClient(id: string, name: string): ClientContext {
  return {
    source: "clients",
    sourceLabel: "Заявки портала Emigrant",
    rowIndex: 0,
    name,
    phone: "+10000000000",
    email: `${id.slice(0, 8)}@example.com`,
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

function searchSingle(client: ClientContext): ClientAiSearchResult {
  return {
    lookup: { kind: "single", client, query: PROFILE_B },
    intent: { ...EMPTY_CLIENT_SEARCH_INTENT, clientName: client.name },
    intentType: "single",
    foundClients: 1,
    sentToClaude: 1,
    usedStructuredSearch: true,
  };
}

function searchAmbiguous(
  clients: ClientContext[],
): ClientAiSearchResult {
  return {
    lookup: {
      kind: "multiple",
      clients,
      pendingParts: clients,
      query: PROFILE_B,
    },
    intent: { ...EMPTY_CLIENT_SEARCH_INTENT, clientName: LABEL_B },
    intentType: "single",
    foundClients: clients.length,
    sentToClaude: clients.length,
    usedStructuredSearch: true,
  };
}

function searchNotFound(): ClientAiSearchResult {
  return {
    lookup: { kind: "not_found", query: PROFILE_B },
    intent: { ...EMPTY_CLIENT_SEARCH_INTENT, clientName: LABEL_B },
    intentType: "single",
    foundClients: 0,
    sentToClaude: 0,
    usedStructuredSearch: true,
  };
}

function synthSafe(id: string): SafeClientRecord {
  return {
    clientId: id,
    name: id === UUID_B ? LABEL_B : LABEL_A,
    latinName: null,
    passport: null,
    email: null,
    phone: null,
    status: null,
    manager: null,
    partner: null,
    submittedAt: null,
    bookingAddress: null,
    bookingRange: null,
    approvalAt: null,
    residenceCardIssuedAt: null,
    expectedApprovalAt: null,
    country: null,
    direction: null,
    notes: null,
  };
}

function synthFinance(id: string): PortalFinanceSnapshot {
  return {
    clientId: id,
    name: id === UUID_B ? LABEL_B : LABEL_A,
    email: null,
    contractAmount: "1 000 €",
    contractAmountCents: 100000,
    paidAmount: "0 €",
    paidAmountCents: 0,
    balance: "1 000 €",
    balanceCents: 100000,
    paymentStatus: "unpaid",
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

function simulateSse(prepared: WorkspaceCaseMemory | null | undefined) {
  const early = caseMemoryForStreamMeta({ prepared, phase: "early" });
  const finalMem = caseMemoryForStreamMeta({
    prepared,
    refreshed: prepared,
    phase: "final",
  });
  return (
    encodeWorkspaceAiSseEvent("status", { phase: "context" }) +
    encodeWorkspaceAiSseMeta({
      requestId: "req-idonly",
      sources: ["Заявки портала Emigrant"],
      demo: false,
      ...(early !== undefined ? { caseMemory: early } : {}),
    }) +
    encodeWorkspaceAiSseEvent("delta", { content: "ok" }) +
    encodeWorkspaceAiSseMeta({
      requestId: "req-idonly",
      sources: ["Заявки портала Emigrant", "Finance"],
      demo: false,
      caseMemory: finalMem ?? null,
    }) +
    encodeWorkspaceAiSseEvent("done", {})
  );
}

/** Real resolveClient with injectable search — exercises id-only reuse gate. */
function resolveWithSearch(
  query: string,
  lockedMemory: WorkspaceCaseMemory | null,
  searchFn: (q: string) => Promise<ClientAiSearchResult>,
) {
  return resolveClient({
    query,
    lockedClientRef: clientRefFromCaseMemory(lockedMemory),
    searchFn,
  });
}

describe("ID_ONLY_CLIENTREF_SWITCH", () => {
  it("A: follow-up debt reuses id-only A (resolver does not search)", async () => {
    const mem = idOnlyA();
    assert.equal(querySuggestsDifferentClient(DEBT_Q, clientRefFromCaseMemory(mem)), false);
    assert.equal(querySuggestsDifferentClient(DOCS_Q, clientRefFromCaseMemory(mem)), false);
    assert.equal(querySuggestsDifferentClient(MORE_Q, clientRefFromCaseMemory(mem)), false);

    let searched = false;
    const resolved = await resolveWithSearch(DEBT_Q, mem, async () => {
      searched = true;
      throw new Error("must_not_search_on_pronoun_followup");
    });
    assert.equal(searched, false);
    assert.equal(resolved.outcome, "RESOLVED_LOCKED");
    assert.equal(resolved.reusedLock, true);
    assert.equal(resolved.clientRef?.clientId, UUID_A);
    assert.equal(resolved.clientRef?.displayLabel, null);

    const prepared = await prepareWorkspaceRequest(
      DEBT_Q,
      [{ role: "user", content: "profile" }, { role: "assistant", content: "ok" }],
      "brief",
      null,
      "req-idonly-debt",
      null,
      null,
      mem,
      true,
      null,
      {
        resolveClient: (params) =>
          resolveClient({
            ...params,
            searchFn: async () => {
              throw new Error("prepare_debt_must_reuse");
            },
          }),
      },
    );
    assert.equal(prepared.kind, "direct");
    if (prepared.kind !== "direct") return;
    assert.equal(
      clientRefFromCaseMemory(prepared.caseMemory ?? null)?.clientId,
      UUID_A,
      "ID_ONLY_FOLLOWUP_REUSES_A",
    );
  });

  it("B: explicit unique B runs resolver and switches A→B", async () => {
    const mem = idOnlyA();
    assert.equal(
      querySuggestsDifferentClient(PROFILE_B, clientRefFromCaseMemory(mem)),
      true,
      "ID_ONLY_EXPLICIT_B_RESOLVER_RUNS signal",
    );

    let searched = false;
    const clientB = portalClient(UUID_B, LABEL_B);
    const resolved = await resolveWithSearch(PROFILE_B, mem, async () => {
      searched = true;
      return searchSingle(clientB);
    });
    assert.equal(searched, true, "ID_ONLY_EXPLICIT_B_RESOLVER_RUNS");
    assert.equal(resolved.outcome, "RESOLVED");
    assert.equal(resolved.reusedLock, false);
    assert.equal(resolved.clientRef?.clientId, UUID_B);
    assert.ok(isQuestionnaireUuid(resolved.clientRef!.clientId));

    const prepared = await prepareWorkspaceRequest(
      PROFILE_B,
      [],
      "brief",
      null,
      "req-idonly-switch",
      null,
      null,
      mem,
      true,
      null,
      {
        resolveClient: (params) =>
          resolveClient({
            ...params,
            searchFn: async () => searchSingle(clientB),
          }),
        lookupClientsWithAiSearch: async () => searchSingle(clientB),
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
      UUID_B,
      "UNIQUE_SWITCH_A_TO_B",
    );
    assert.ok(
      prepared.trace.notes.some((n) => /client_ref_switched/.test(n)),
      "switch note",
    );

    const early = caseMemoryForStreamMeta({
      prepared: prepared.caseMemory,
      phase: "early",
    });
    assert.equal(early?.linkedClientId, UUID_B, "FIRST_SSE_AFTER_SWITCH_B");
    const ui = reduceWorkspaceAiSseTranscriptCaseMemory(
      simulateSse(prepared.caseMemory),
      null,
    );
    assert.equal(ui?.linkedClientId, UUID_B);

    // Durable same-chat memory = committed B (identity write shape).
    const durable = sanitizeCaseMemory({
      linkedClientId: prepared.caseMemory?.linkedClientId,
      clientName: prepared.caseMemory?.clientName ?? null,
    });
    assert.equal(durable?.linkedClientId, UUID_B, "DURABLE_AFTER_SWITCH_B");
  });

  it("C: follow-up after switch keeps B", async () => {
    const afterSwitch = sanitizeCaseMemory({
      linkedClientId: UUID_B,
      clientName: LABEL_B,
    });
    assert.equal(clientRefFromCaseMemory(afterSwitch)?.clientId, UUID_B);

    const resolved = await resolveWithSearch(DEBT_Q, afterSwitch, async () => {
      throw new Error("must_reuse_B");
    });
    assert.equal(resolved.reusedLock, true);
    assert.equal(resolved.clientRef?.clientId, UUID_B, "FOLLOWUP_AFTER_SWITCH_B");
  });

  it("D: reload recovery returns B (authorized durable overlay)", async () => {
    // Mirrors resolveCaseMemoryForWorkspaceRequest when POST omits caseMemory.
    const durableB = sanitizeCaseMemory({ linkedClientId: UUID_B, clientName: LABEL_B });
    const { resolveCaseMemoryForWorkspaceRequest } = await import(
      "@/lib/ai/workspace-case-memory-recovery"
    );
    const recovered = await resolveCaseMemoryForWorkspaceRequest({
      userId: "user-1",
      chatId: "chat-owned-1",
      requestCaseMemory: null,
      loadAuthorizedChat: async (uid, cid) => {
        if (uid !== "user-1" || cid !== "chat-owned-1") return null;
        return { caseMemory: durableB };
      },
    });
    assert.equal(recovered.recoveredFromDurable, true);
    assert.equal(
      clientRefFromCaseMemory(recovered.caseMemory)?.clientId,
      UUID_B,
      "RELOAD_AFTER_SWITCH_B",
    );
  });

  it("E: ambiguous explicit B does not replace A", async () => {
    const mem = idOnlyA();
    const c1 = portalClient(UUID_B, LABEL_B);
    const c2 = portalClient("c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3", "AI SYNTH IDONLY GAMMA");
    const resolved = await resolveWithSearch(PROFILE_B, mem, async () =>
      searchAmbiguous([c1, c2]),
    );
    assert.equal(resolved.outcome, "AMBIGUOUS");
    assert.equal(resolved.clientRef, null);

    const prepared = await prepareWorkspaceRequest(
      PROFILE_B,
      [],
      "brief",
      null,
      "req-idonly-amb",
      null,
      null,
      mem,
      true,
      null,
      {
        resolveClient: (params) =>
          resolveClient({
            ...params,
            searchFn: async () => searchAmbiguous([c1, c2]),
          }),
        lookupClientsWithAiSearch: async () => searchAmbiguous([c1, c2]),
        buildWorkspaceContext: async () => emptyContext() as never,
      },
    );
    // Must not silently lock B (or any other UUID).
    const locked = clientRefFromCaseMemory(
      prepared.kind === "ai" || prepared.kind === "direct" || prepared.kind === "agent"
        ? prepared.caseMemory ?? null
        : null,
    );
    assert.notEqual(locked?.clientId, UUID_B, "AMBIGUOUS_SWITCH_SAFE");
    // A may remain if prepare kept inbound memory, or null if cleared — never B.
    if (locked) {
      assert.equal(locked.clientId, UUID_A);
    }
  });

  it("F: not-found explicit B does not invent a lock", async () => {
    const mem = idOnlyA();
    const resolved = await resolveWithSearch(PROFILE_B, mem, async () =>
      searchNotFound(),
    );
    assert.equal(resolved.outcome, "NOT_FOUND");
    assert.equal(resolved.clientRef, null);

    const prepared = await prepareWorkspaceRequest(
      PROFILE_B,
      [],
      "brief",
      null,
      "req-idonly-nf",
      null,
      null,
      mem,
      true,
      null,
      {
        resolveClient: (params) =>
          resolveClient({
            ...params,
            searchFn: async () => searchNotFound(),
          }),
        lookupClientsWithAiSearch: async () => searchNotFound(),
        buildWorkspaceContext: async () => emptyContext() as never,
      },
    );
    const locked = clientRefFromCaseMemory(
      prepared.kind === "ai" || prepared.kind === "direct" || prepared.kind === "agent"
        ? prepared.caseMemory ?? null
        : mem,
    );
    assert.notEqual(locked?.clientId, UUID_B, "NOT_FOUND_SWITCH_SAFE");
    // No invented questionnaire UUID for B.
    if (locked?.clientId) {
      assert.equal(locked.clientId, UUID_A);
    }
  });

  it("G: general non-client question does not switch", async () => {
    const mem = idOnlyA();
    assert.equal(
      querySuggestsDifferentClient(GENERAL_Q, clientRefFromCaseMemory(mem)),
      false,
      "GENERAL_REQUEST_SAFE signal",
    );
    const resolved = await resolveWithSearch(GENERAL_Q, mem, async () => {
      throw new Error("general_must_not_search");
    });
    assert.equal(resolved.reusedLock, true);
    assert.equal(resolved.clientRef?.clientId, UUID_A);

    const prepared = await prepareWorkspaceRequest(
      GENERAL_Q,
      [],
      "brief",
      null,
      "req-idonly-general",
      null,
      null,
      mem,
      true,
      null,
      {
        resolveClient: (params) =>
          resolveClient({
            ...params,
            searchFn: async () => {
              throw new Error("prepare_general_must_not_search");
            },
          }),
        buildWorkspaceContext: async () => emptyContext() as never,
      },
    );
    const locked = clientRefFromCaseMemory(
      prepared.kind === "ai" ||
        prepared.kind === "direct" ||
        prepared.kind === "agent"
        ? prepared.caseMemory ?? null
        : mem,
    );
    assert.equal(locked?.clientId, UUID_A, "GENERAL_REQUEST_SAFE");
  });

  it("H: cross-chat and cross-user recovery blocked", async () => {
    const durableB = sanitizeCaseMemory({ linkedClientId: UUID_B });
    const { resolveCaseMemoryForWorkspaceRequest } = await import(
      "@/lib/ai/workspace-case-memory-recovery"
    );
    const crossChat = await resolveCaseMemoryForWorkspaceRequest({
      userId: "user-1",
      chatId: "chat-B",
      requestCaseMemory: null,
      loadAuthorizedChat: async (_uid, cid) => {
        if (cid === "chat-A") return { caseMemory: durableB };
        return { caseMemory: null };
      },
    });
    assert.equal(
      clientRefFromCaseMemory(crossChat.caseMemory),
      null,
      "CROSS_CHAT_ISOLATION",
    );

    const crossUser = await resolveCaseMemoryForWorkspaceRequest({
      userId: "user-2",
      chatId: "chat-A",
      requestCaseMemory: null,
      loadAuthorizedChat: async (uid) => {
        if (uid !== "user-1") return null;
        return { caseMemory: durableB };
      },
    });
    assert.equal(
      clientRefFromCaseMemory(crossUser.caseMemory),
      null,
      "CROSS_USER_ISOLATION",
    );
  });

  it("displayLabel absence is valid; createClientRef still UUID-only identity", () => {
    const ref = createClientRef({ clientId: UUID_A, displayLabel: null });
    assert.ok(ref);
    assert.equal(ref!.clientId, UUID_A);
    assert.equal(ref!.displayLabel, null);
    assert.equal(isQuestionnaireUuid(ref!.clientId), true);
    // Switching correctness does not require displayLabel.
    assert.equal(
      querySuggestsDifferentClient(PROFILE_B, ref),
      true,
    );
    assert.equal(
      querySuggestsDifferentClient(DEBT_Q, ref),
      false,
    );
  });
});
