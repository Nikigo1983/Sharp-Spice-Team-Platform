/**
 * True browser-contract + durable recovery regressions for ClientRef.
 * No manual ClientRef injection after SERVER_RESOLVED.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClientRef } from "@/lib/ai/client-ref";
import {
  applyClientSwitch,
  caseMemoryForModelIngress,
  clientRefFromCaseMemory,
  lockClientRefIntoCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  classifyCurrentTask,
  taskRequiresClientRef,
} from "@/lib/ai/current-task";
import {
  assertNoHighSensitivityInPack,
  buildEvidencePack,
  formatEvidencePackForModel,
  isMigratedClientModelPath,
  selectClientModelIngress,
} from "@/lib/ai/evidence-pack";
import {
  formatFinanceClientDebtReply,
  isLockedClientDebtStatusQuery,
  isPronounDebtFollowUpQuery,
} from "@/lib/ai/finance-debt-query";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";
import {
  querySuggestsDifferentClient,
  resolveClient,
} from "@/lib/ai/resolve-client";
import type { SafeClientRecord } from "@/lib/ai/workspace-tools/client-tools";
import {
  caseMemoryForStreamMeta,
  selectAuthoritativeCaseMemory,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";
import {
  createLiveCaseMemoryController,
  encodeWorkspaceAiSseEvent,
  encodeWorkspaceAiSseMeta,
  parseWorkspaceAiTurnRequestCaseMemory,
  reduceWorkspaceAiSseTranscriptToLiveCaseMemory,
  serializeWorkspaceAiTurnRequest,
} from "@/lib/ai/workspace-ai-browser-contract";

const FEMALE_UUID = "f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1";
const FEMALE_LABEL = "AI SYNTH FEMALE CLIENT";
const MALE_UUID = "c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1";
const MALE_LABEL = "AI SYNTH MALE CLIENT";
const ALPHA_UUID = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";
const BETA_UUID = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1";
const ALPHA_LABEL = "AI SYNTH ALPHA ZORIN";
const BETA_LABEL = "AI SYNTH BETA KAPLAN";

const FULL_PROFILE_Q = `Найди всю информацию по клиенту ${FEMALE_LABEL}`;
const DEBT_NEYA = "Какой у нее долг?";
const DEBT_NYO = "Какой у неё долг?";
const DEBT_NEGO = "Какой у него долг?";
const APOSTILLE = "Объясни простыми словами, что такое апостиль.";

function femaleRef() {
  return createClientRef({
    clientId: FEMALE_UUID,
    displayLabel: FEMALE_LABEL,
  })!;
}
function maleRef() {
  return createClientRef({
    clientId: MALE_UUID,
    displayLabel: MALE_LABEL,
  })!;
}
function alphaRef() {
  return createClientRef({
    clientId: ALPHA_UUID,
    displayLabel: ALPHA_LABEL,
  })!;
}
function betaRef() {
  return createClientRef({
    clientId: BETA_UUID,
    displayLabel: BETA_LABEL,
  })!;
}

function lockOf(
  ref: NonNullable<ReturnType<typeof createClientRef>>,
): WorkspaceCaseMemory {
  return lockClientRefIntoCaseMemory(null, ref);
}

function femaleFinance(): PortalFinanceSnapshot {
  return {
    clientId: FEMALE_UUID,
    name: FEMALE_LABEL,
    email: "ai-synthetic-female@example.com",
    contractAmount: "2 500 €",
    contractAmountCents: 250000,
    paidAmount: "1 500 €",
    paidAmountCents: 150000,
    balance: "1 000 €",
    balanceCents: 100000,
    paymentStatus: "partial",
    contractLabel: null,
    staffContractAmount: null,
  };
}

function financeById(id: string, label: string): PortalFinanceSnapshot {
  return {
    ...femaleFinance(),
    clientId: id,
    name: label,
    email: `ai-synthetic-${id.slice(0, 8)}@example.com`,
  };
}

function femaleSafe(): SafeClientRecord {
  return {
    clientId: FEMALE_UUID,
    name: FEMALE_LABEL,
    latinName: FEMALE_LABEL,
    passport: null,
    email: "ai-synthetic-female@example.com",
    phone: null,
    status: "в работе",
    manager: null,
    partner: null,
    submittedAt: null,
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

function simulateFullSafeProfileSse(prepared: WorkspaceCaseMemory): string {
  const early = caseMemoryForStreamMeta({ prepared, phase: "early" });
  const finalMem = caseMemoryForStreamMeta({
    prepared,
    refreshed: { ...prepared, specialNotes: "store refresh" },
    phase: "final",
  });
  return (
    encodeWorkspaceAiSseEvent("status", { phase: "context" }) +
    encodeWorkspaceAiSseMeta({
      requestId: "req-browser-contract",
      sources: [],
      demo: false,
      ...(early !== undefined ? { caseMemory: early } : {}),
    }) +
    encodeWorkspaceAiSseEvent("status", { phase: "generating" }) +
    encodeWorkspaceAiSseEvent("delta", {
      content: "FULL_SAFE_PROFILE synthetic answer",
    }) +
    encodeWorkspaceAiSseMeta({
      requestId: "req-browser-contract",
      sources: ["Заявки портала Emigrant", "Finance"],
      demo: false,
      caseMemory: finalMem ?? null,
    }) +
    encodeWorkspaceAiSseEvent("done", {})
  );
}

async function assertPronounDebtFinance(
  lockedMemory: WorkspaceCaseMemory | null,
  query: string,
  expectedId: string,
  label: string,
) {
  assert.equal(isPronounDebtFollowUpQuery(query), true, query);
  assert.equal(isLockedClientDebtStatusQuery(query), true, query);
  const locked = clientRefFromCaseMemory(lockedMemory);
  assert.ok(locked, `missing lock for ${query}`);
  assert.equal(locked.clientId, expectedId, query);
  assert.equal(querySuggestsDifferentClient(query, locked), false, query);

  const resolved = await resolveClient({
    query,
    lockedClientRef: locked,
    searchFn: async () => {
      throw new Error("must_not_search_on_pronoun_debt");
    },
  });
  assert.equal(resolved.outcome, "RESOLVED_LOCKED", query);
  assert.equal(resolved.reusedLock, true, query);
  assert.equal(resolved.clientRef?.clientId, expectedId, query);

  const finance = financeById(expectedId, label);
  const reply = formatFinanceClientDebtReply({
    name: label,
    email: finance.email,
    contractAmount: finance.contractAmount,
    contractAmountCents: finance.contractAmountCents,
    paidAmount: finance.paidAmount,
    balance: finance.balance,
    balanceCents: finance.balanceCents,
    nameHint: label,
  });
  assert.match(reply, /1[,.\s\u00a0]?000|1000/i);
}

/**
 * Test-double for resolveCaseMemoryForWorkspaceRequest without touching disk.
 * Mirrors production precedence + ownership rules.
 */
function recoverCaseMemoryForTest(params: {
  requestCaseMemory: WorkspaceCaseMemory | null;
  chatId: string | null;
  authorizedUserId: string;
  requestUserId: string;
  durableByChat: Record<string, { ownerId: string; memory: WorkspaceCaseMemory | null }>;
}): { caseMemory: WorkspaceCaseMemory | null; recoveredFromDurable: boolean } {
  const request = params.requestCaseMemory;
  if (clientRefFromCaseMemory(request)) {
    return { caseMemory: request, recoveredFromDurable: false };
  }
  const chatId = params.chatId?.trim() || null;
  if (!chatId) return { caseMemory: request, recoveredFromDurable: false };
  if (params.requestUserId !== params.authorizedUserId) {
    return { caseMemory: request, recoveredFromDurable: false };
  }
  const entry = params.durableByChat[chatId];
  if (!entry || entry.ownerId !== params.requestUserId) {
    return { caseMemory: request, recoveredFromDurable: false };
  }
  const durableRef = clientRefFromCaseMemory(entry.memory);
  if (!durableRef) return { caseMemory: request, recoveredFromDurable: false };
  const identity = lockClientRefIntoCaseMemory(null, durableRef);
  const merged = selectAuthoritativeCaseMemory({
    prepared: request,
    refreshed: identity,
  });
  return {
    caseMemory: merged,
    recoveredFromDurable: Boolean(clientRefFromCaseMemory(merged)),
  };
}

describe("CLIENTREF_TRUE_BROWSER_CONTRACT", () => {
  it("FULL_SAFE_PROFILE live meta → delayed persist → Turn2 pronouns", async () => {
    const task = classifyCurrentTask({ query: FULL_PROFILE_Q });
    assert.equal(task.taskClass, "CLIENT_SUMMARY");
    assert.deepEqual(task.requiredProjections, ["FULL_SAFE_PROFILE"]);
    assert.equal(taskRequiresClientRef(task), true);

    const prepared = lockOf(femaleRef());
    assert.equal(
      clientRefFromCaseMemory(prepared)?.clientId,
      FEMALE_UUID,
      "SERVER_RESOLVED_CLIENTREF",
    );

    const pack = buildEvidencePack({
      task,
      clientRef: femaleRef(),
      safe: femaleSafe(),
      finance: femaleFinance(),
      documents: [
        {
          documentId: "doc-synth-1",
          title: "synth-contract.pdf",
          category: "contract",
        },
      ],
    });
    assert.ok(pack.projections.FINANCE);
    assert.equal(assertNoHighSensitivityInPack(pack).ok, true);
    const formatted = formatEvidencePackForModel(pack);
    assert.doesNotMatch(formatted, /documentContent|ocr|passportNumber/i);
    const migrated = isMigratedClientModelPath({
      hasClientRef: true,
      modelRequired: true,
      requiredProjectionCount: task.requiredProjections.length,
    });
    const ingress = selectClientModelIngress({
      migratedClientModelPath: migrated,
      evidencePackText: formatted,
    });
    assert.equal(ingress.allowBroadClientContext, false);
    assert.equal(ingress.broadClientFallbackToModel, false);

    const sse = simulateFullSafeProfileSse(prepared);
    const live = createLiveCaseMemoryController(null);
    let persistCompleted = false;

    // Early meta commits live ClientRef immediately (before persist).
    const earlyOnly =
      encodeWorkspaceAiSseEvent("status", { phase: "context" }) +
      encodeWorkspaceAiSseMeta({
        requestId: "req-early",
        sources: [],
        demo: false,
        caseMemory: caseMemoryForStreamMeta({
          prepared,
          phase: "early",
        }),
      });
    reduceWorkspaceAiSseTranscriptToLiveCaseMemory(earlyOnly, live);
    assert.equal(
      clientRefFromCaseMemory(live.get())?.clientId,
      FEMALE_UUID,
      "BROWSER_META_UPDATES_LIVE_CLIENTREF",
    );

    // Intentionally delayed persist — Turn 2 must not wait.
    const persistPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        persistCompleted = true;
        resolve();
      }, 50);
    });

    reduceWorkspaceAiSseTranscriptToLiveCaseMemory(sse, live);
    assert.equal(persistCompleted, false, "NEXT_SEND_DOES_NOT_WAIT_FOR_PERSIST");
    assert.equal(
      clientRefFromCaseMemory(live.get())?.clientId,
      FEMALE_UUID,
      "UI live after full stream (persist still pending)",
    );

    const turn2Json = serializeWorkspaceAiTurnRequest({
      message: DEBT_NEYA,
      history: [
        { role: "user", content: FULL_PROFILE_Q },
        { role: "assistant", content: "FULL_SAFE_PROFILE synthetic answer" },
      ],
      mode: "brief",
      chatId: "chat-browser-contract",
      caseMemory: live.get(),
    });
    assert.equal(persistCompleted, false, "Turn2 built while persist pending");
    const postBody = JSON.parse(turn2Json) as {
      caseMemory?: { linkedClientId?: string | null };
    };
    assert.equal(
      postBody.caseMemory?.linkedClientId,
      FEMALE_UUID,
      "TURN2_POST_CLIENTREF",
    );

    const serverTurn2 = parseWorkspaceAiTurnRequestCaseMemory(turn2Json);
    assert.equal(
      clientRefFromCaseMemory(serverTurn2)?.clientId,
      FEMALE_UUID,
      "ROUTE_RECEIVES_POST_CLIENTREF",
    );

    await assertPronounDebtFinance(
      serverTurn2,
      DEBT_NEYA,
      FEMALE_UUID,
      FEMALE_LABEL,
    );
    await assertPronounDebtFinance(
      serverTurn2,
      DEBT_NYO,
      FEMALE_UUID,
      FEMALE_LABEL,
    );

    // Male fixture via same live path
    const malePrepared = lockOf(maleRef());
    const maleLive = createLiveCaseMemoryController(null);
    reduceWorkspaceAiSseTranscriptToLiveCaseMemory(
      simulateFullSafeProfileSse(malePrepared),
      maleLive,
    );
    await assertPronounDebtFinance(
      maleLive.get(),
      DEBT_NEGO,
      MALE_UUID,
      MALE_LABEL,
    );

    await persistPromise;
    assert.equal(persistCompleted, true);
  });

  it("durable recovery when Turn2 POST omits caseMemory", async () => {
    const durable = lockOf(femaleRef());
    const recovered = recoverCaseMemoryForTest({
      requestCaseMemory: null,
      chatId: "chat-C",
      authorizedUserId: "user-1",
      requestUserId: "user-1",
      durableByChat: {
        "chat-C": { ownerId: "user-1", memory: durable },
      },
    });
    assert.equal(recovered.recoveredFromDurable, true);
    assert.equal(
      clientRefFromCaseMemory(recovered.caseMemory)?.clientId,
      FEMALE_UUID,
      "DURABLE_CHAT_CLIENTREF_RECOVERY",
    );
    await assertPronounDebtFinance(
      recovered.caseMemory,
      DEBT_NEYA,
      FEMALE_UUID,
      FEMALE_LABEL,
    );
  });

  it("page reload: empty React state + durable chat restores ClientRef", async () => {
    const live = createLiveCaseMemoryController(null); // reload wiped React
    assert.equal(clientRefFromCaseMemory(live.get()), null);

    const postOmit = serializeWorkspaceAiTurnRequest({
      message: DEBT_NEYA,
      history: [
        { role: "user", content: FULL_PROFILE_Q },
        { role: "assistant", content: "ok" },
      ],
      mode: "brief",
      chatId: "chat-reload",
      caseMemory: null,
    });
    assert.equal("caseMemory" in JSON.parse(postOmit), false);

    const recovered = recoverCaseMemoryForTest({
      requestCaseMemory: parseWorkspaceAiTurnRequestCaseMemory(postOmit),
      chatId: "chat-reload",
      authorizedUserId: "user-1",
      requestUserId: "user-1",
      durableByChat: {
        "chat-reload": { ownerId: "user-1", memory: lockOf(femaleRef()) },
      },
    });
    assert.equal(
      clientRefFromCaseMemory(recovered.caseMemory)?.clientId,
      FEMALE_UUID,
      "PAGE_RELOAD_CLIENTREF_RECOVERY",
    );
    await assertPronounDebtFinance(
      recovered.caseMemory,
      DEBT_NYO,
      FEMALE_UUID,
      FEMALE_LABEL,
    );
  });

  it("unauthorized / cross-chat / cross-user recovery blocked", () => {
    const alpha = lockOf(alphaRef());
    const crossChat = recoverCaseMemoryForTest({
      requestCaseMemory: null,
      chatId: "chat-B",
      authorizedUserId: "user-1",
      requestUserId: "user-1",
      durableByChat: {
        "chat-A": { ownerId: "user-1", memory: alpha },
        "chat-B": { ownerId: "user-1", memory: null },
      },
    });
    assert.equal(
      clientRefFromCaseMemory(crossChat.caseMemory),
      null,
      "CROSS_CHAT_RECOVERY must be NO",
    );

    const crossUser = recoverCaseMemoryForTest({
      requestCaseMemory: null,
      chatId: "chat-A",
      authorizedUserId: "user-1",
      requestUserId: "user-2",
      durableByChat: {
        "chat-A": { ownerId: "user-1", memory: alpha },
      },
    });
    assert.equal(
      clientRefFromCaseMemory(crossUser.caseMemory),
      null,
      "CROSS_USER_RECOVERY must be NO",
    );

    const missing = recoverCaseMemoryForTest({
      requestCaseMemory: null,
      chatId: "chat-missing",
      authorizedUserId: "user-1",
      requestUserId: "user-1",
      durableByChat: {},
    });
    assert.equal(
      clientRefFromCaseMemory(missing.caseMemory),
      null,
      "UNAUTHORIZED_CHAT_RECOVERY_BLOCKED",
    );
  });

  it("explicit BETA switch beats stale durable ALPHA", async () => {
    const switched = applyClientSwitch({
      memory: lockOf(alphaRef()),
      previous: alphaRef(),
      next: betaRef(),
    });
    assert.equal(switched.memory.linkedClientId, BETA_UUID);

    // Request body has BETA (after switch SSE → live → POST).
    const withPost = recoverCaseMemoryForTest({
      requestCaseMemory: switched.memory,
      chatId: "chat-switch",
      authorizedUserId: "user-1",
      requestUserId: "user-1",
      durableByChat: {
        "chat-switch": { ownerId: "user-1", memory: lockOf(alphaRef()) },
      },
    });
    assert.equal(withPost.recoveredFromDurable, false);
    assert.equal(
      clientRefFromCaseMemory(withPost.caseMemory)?.clientId,
      BETA_UUID,
      "STALE_DURABLE_LOCK_OVERRIDES_SWITCH must be NO",
    );

    const auth = selectAuthoritativeCaseMemory({
      prepared: switched.memory,
      refreshed: lockOf(alphaRef()),
    });
    assert.equal(auth?.linkedClientId, BETA_UUID);

    await assertPronounDebtFinance(
      withPost.caseMemory,
      DEBT_NEGO,
      BETA_UUID,
      BETA_LABEL,
    );
  });

  it("general task keeps dormant ClientRef; follow-up reuses lock", async () => {
    const live = createLiveCaseMemoryController(lockOf(betaRef()));
    const generalIngress = caseMemoryForModelIngress({
      caseMemory: live.get(),
      taskRequiresClientRef: false,
      needsClients: false,
      fastClientLookup: false,
    });
    assert.equal(generalIngress, null, "GENERAL_TASK_NO_STALE_CLIENT_EVIDENCE");
    assert.equal(
      clientRefFromCaseMemory(live.get())?.clientId,
      BETA_UUID,
      "CLIENT_LOCK_SURVIVES_GENERAL_TASK",
    );

    // Apostille does not clear live lock.
    void APOSTILLE;
    await assertPronounDebtFinance(
      live.get(),
      DEBT_NEGO,
      BETA_UUID,
      BETA_LABEL,
    );
  });

  it("late null meta does not erase live ClientRef", () => {
    const live = createLiveCaseMemoryController(null);
    reduceWorkspaceAiSseTranscriptToLiveCaseMemory(
      encodeWorkspaceAiSseMeta({
        requestId: "r1",
        sources: [],
        demo: false,
        caseMemory: lockOf(femaleRef()),
      }),
      live,
    );
    reduceWorkspaceAiSseTranscriptToLiveCaseMemory(
      encodeWorkspaceAiSseMeta({
        requestId: "r1",
        sources: [],
        demo: false,
        caseMemory: null,
      }),
      live,
    );
    assert.equal(clientRefFromCaseMemory(live.get())?.clientId, FEMALE_UUID);
  });
});

describe("CLIENTREF_DURABLE_RECOVERY_MODULE", () => {
  it("resolveCaseMemoryForWorkspaceRequest hydrates authorized chat only", async () => {
    const { resolveCaseMemoryForWorkspaceRequest } = await import(
      "@/lib/ai/workspace-case-memory-recovery"
    );
    const durable = lockOf(femaleRef());

    const hit = await resolveCaseMemoryForWorkspaceRequest({
      userId: "user-1",
      chatId: "chat-ok",
      requestCaseMemory: null,
      loadAuthorizedChat: async (userId, chatId) => {
        if (userId === "user-1" && chatId === "chat-ok") {
          return { caseMemory: durable };
        }
        return null;
      },
    });
    assert.equal(hit.recoveredFromDurable, true);
    assert.equal(clientRefFromCaseMemory(hit.caseMemory)?.clientId, FEMALE_UUID);

    const miss = await resolveCaseMemoryForWorkspaceRequest({
      userId: "user-1",
      chatId: "chat-other",
      requestCaseMemory: null,
      loadAuthorizedChat: async () => null,
    });
    assert.equal(miss.recoveredFromDurable, false);
    assert.equal(clientRefFromCaseMemory(miss.caseMemory), null);

    const bodyWins = await resolveCaseMemoryForWorkspaceRequest({
      userId: "user-1",
      chatId: "chat-ok",
      requestCaseMemory: lockOf(betaRef()),
      loadAuthorizedChat: async () => ({ caseMemory: durable }),
    });
    assert.equal(bodyWins.recoveredFromDurable, false);
    assert.equal(clientRefFromCaseMemory(bodyWins.caseMemory)?.clientId, BETA_UUID);
  });
});
