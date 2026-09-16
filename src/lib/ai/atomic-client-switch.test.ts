/**
 * Atomic client switch — full prepare→store merge→SSE→UI→next POST lifecycle.
 * Synthetic fixtures only; no OpenRouter / DB writes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClientRef } from "@/lib/ai/client-ref";
import {
  applyClientSwitch,
  bindClientBoundDraftToCaseMemory,
  clientRefFromCaseMemory,
  lockClientRefIntoCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  classifyCurrentTask,
  isFollowUpTransformQuery,
  taskRequiresClientRef,
} from "@/lib/ai/current-task";
import {
  formatDebtReminderLetter,
  isClientDebtReminderLetterQuery,
} from "@/lib/ai/client-debt-letter";
import { planFollowUpTransform } from "@/lib/ai/follow-up-transform";
import {
  isLockedClientDebtStatusQuery,
  isPronounDebtFollowUpQuery,
} from "@/lib/ai/finance-debt-query";
import {
  querySuggestsDifferentClient,
  resolveClient,
} from "@/lib/ai/resolve-client";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";
import {
  CLIENT_BOUND_DRAFT_CLEARED,
  mergeCaseMemoryFromClientSnapshot,
  mergeStreamCaseMemoryUpdate,
  selectAuthoritativeCaseMemory,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";
import { queryRequiresVolatileRefetch } from "@/lib/ai/volatile-facts";
import {
  isMigratedClientModelPath,
  selectClientModelIngress,
} from "@/lib/ai/evidence-pack";

const ALPHA_UUID = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";
const BETA_UUID = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1";
const ALPHA_LABEL = "AI SYNTH ALPHA ZORIN";
const BETA_LABEL = "AI SYNTH BETA KAPLAN";

const SWITCH_QUERY = `Переключись на клиента ${BETA_LABEL}`;
const DEBT_QUERY = "Какой у него долг?";
const VOLATILE_DEBT = "Какой у него долг на сегодня?";
const TRANSFORM = "Сделай короче и теплее";
const APOSTILLE = "Объясни простыми словами, что такое апостиль.";

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

function financeById(id: string): PortalFinanceSnapshot {
  if (id === BETA_UUID) {
    return {
      clientId: BETA_UUID,
      name: BETA_LABEL,
      email: "ai-synthetic-beta@example.com",
      contractAmount: "3 100 €",
      contractAmountCents: 310000,
      paidAmount: "2 100 €",
      paidAmountCents: 210000,
      balance: "1 000 €",
      balanceCents: 100000,
      paymentStatus: "partial",
      contractLabel: null,
      staffContractAmount: null,
    };
  }
  return {
    clientId: ALPHA_UUID,
    name: ALPHA_LABEL,
    email: "ai-synthetic-alpha@example.com",
    contractAmount: "2 000 €",
    contractAmountCents: 200000,
    paidAmount: "750 €",
    paidAmountCents: 75000,
    balance: "1 250 €",
    balanceCents: 125000,
    paymentStatus: "partial",
    contractLabel: null,
    staffContractAmount: null,
  };
}

function mockSearch(query: string) {
  const lower = query.toLowerCase();
  if (lower.includes("beta") || lower.includes("kaplan")) {
    return {
      lookup: {
        kind: "single" as const,
        client: {
          name: BETA_LABEL,
          score: 1,
          debugRow: { id: BETA_UUID },
        },
      },
      debug: {},
    };
  }
  if (lower.includes("alpha") || lower.includes("zorin")) {
    return {
      lookup: {
        kind: "single" as const,
        client: {
          name: ALPHA_LABEL,
          score: 1,
          debugRow: { id: ALPHA_UUID },
        },
      },
      debug: {},
    };
  }
  return { lookup: { kind: "not_found" as const }, debug: {} };
}

/** Seed ALPHA lock + client-bound facts + active reminder draft (pre-switch). */
function seedAlphaConversationState(): WorkspaceCaseMemory {
  let memory = lockClientRefIntoCaseMemory(null, alphaRef());
  memory = {
    ...memory,
    specialNotes: "долг 1 250 €",
    employers: "ai-synthetic-alpha@example.com",
    citizenship: "Testland",
    dates: "подача: 2026-01-01",
  };
  return bindClientBoundDraftToCaseMemory(memory, ALPHA_UUID);
}

/**
 * Simulate prepare switch + durable store refresh + SSE + UI persist.
 * This is the lifecycle the unit-only switch test previously skipped.
 */
async function runExplicitSwitchLifecycle(store: WorkspaceCaseMemory) {
  // A: request enters with ALPHA lock
  assert.equal(clientRefFromCaseMemory(store)?.clientId, ALPHA_UUID);

  assert.equal(querySuggestsDifferentClient(SWITCH_QUERY, alphaRef()), true);

  // B/C: resolve BETA and apply atomic switch (prepare)
  const resolved = await resolveClient({
    query: SWITCH_QUERY,
    lockedClientRef: alphaRef(),
    searchFn: async (q) => mockSearch(q),
  });
  assert.equal(resolved.outcome, "RESOLVED");
  assert.equal(resolved.clientRef?.clientId, BETA_UUID);
  assert.equal(resolved.reusedLock, false);

  const switched = applyClientSwitch({
    memory: store,
    previous: alphaRef(),
    next: resolved.clientRef!,
  });
  assert.equal(switched.switched, true);
  assert.equal(switched.memory.linkedClientId, BETA_UUID);
  assert.equal(switched.memory.specialNotes, null);
  assert.equal(switched.memory.employers, null);
  assert.equal(switched.memory.citizenship, null);
  assert.equal(switched.memory.draftClientId, CLIENT_BOUND_DRAFT_CLEARED);
  const prepared = switched.memory;

  // Store still has stale ALPHA (as before request completes).
  // Snapshot merge for BETA must not restore ALPHA lock.
  const storeMerged = mergeCaseMemoryFromClientSnapshot(store, {
    id: BETA_UUID,
    name: BETA_LABEL,
  });
  assert.equal(storeMerged?.linkedClientId, BETA_UUID);
  assert.notEqual(storeMerged?.specialNotes, "долг 1 250 €");

  // Even if refresh somehow returned ALPHA-linked memory, prepare wins.
  const staleRefresh: WorkspaceCaseMemory = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  const sseMemory = selectAuthoritativeCaseMemory({
    prepared,
    refreshed: staleRefresh,
  });
  assert.equal(sseMemory?.linkedClientId, BETA_UUID, "SWITCH_SSE");
  assert.equal(sseMemory?.specialNotes, null);
  assert.equal(sseMemory?.draftClientId, CLIENT_BOUND_DRAFT_CLEARED);

  // E: UI persists SSE
  let ui = mergeStreamCaseMemoryUpdate(undefined, store, true);
  ui = mergeStreamCaseMemoryUpdate(ui, sseMemory, true);
  assert.equal(clientRefFromCaseMemory(ui)?.clientId, BETA_UUID, "SWITCH_UI");

  return { prepared, sseMemory, uiCaseMemory: ui as WorkspaceCaseMemory };
}

describe("ATOMIC_CLIENT_SWITCH_STATE", () => {
  it("prepare→store merge→SSE→UI never restores ALPHA after BETA switch", async () => {
    const store = seedAlphaConversationState();
    const { prepared, sseMemory, uiCaseMemory } =
      await runExplicitSwitchLifecycle(store);
    assert.equal(prepared.linkedClientId, BETA_UUID);
    assert.equal(sseMemory?.linkedClientId, BETA_UUID);
    assert.equal(uiCaseMemory.linkedClientId, BETA_UUID);
    assert.equal(uiCaseMemory.specialNotes, null);
    assert.equal(uiCaseMemory.employers, null);
  });
});

describe("SWITCH_SSE_RETURNS_NEW_CLIENTREF", () => {
  it("authoritative SSE memory is BETA even when store refresh is ALPHA", async () => {
    const store = seedAlphaConversationState();
    const { sseMemory } = await runExplicitSwitchLifecycle(store);
    assert.equal(clientRefFromCaseMemory(sseMemory)?.clientId, BETA_UUID);
    assert.notEqual(clientRefFromCaseMemory(sseMemory)?.clientId, ALPHA_UUID);
  });
});

describe("SWITCH_UI_NEXT_POST_RETURNS_NEW_CLIENTREF", () => {
  it("next POST carries BETA ClientRef from UI state", async () => {
    const store = seedAlphaConversationState();
    const { uiCaseMemory } = await runExplicitSwitchLifecycle(store);
    const nextPostLock = clientRefFromCaseMemory(uiCaseMemory);
    assert.equal(nextPostLock?.clientId, BETA_UUID);
  });
});

describe("SWITCH_INVALIDATES_OLD_CLIENT_BOUND_FACTS", () => {
  it("ALPHA finance/contact/profile facts and draft are cleared", () => {
    const store = seedAlphaConversationState();
    const switched = applyClientSwitch({
      memory: store,
      previous: alphaRef(),
      next: betaRef(),
    });
    assert.equal(switched.memory.linkedClientId, BETA_UUID);
    assert.equal(switched.memory.specialNotes, null);
    assert.equal(switched.memory.employers, null);
    assert.equal(switched.memory.citizenship, null);
    assert.equal(switched.memory.dates, null);
    assert.equal(switched.memory.draftClientId, CLIENT_BOUND_DRAFT_CLEARED);
    assert.doesNotMatch(
      JSON.stringify(switched.memory),
      /1\s*250|1250|alpha@example/i,
    );
  });
});

describe("SWITCH_NEXT_PRONOUN_FINANCE_USES_NEW_CLIENT", () => {
  it("Какой у него долг? after switch uses BETA UUID and 1000 EUR", async () => {
    const store = seedAlphaConversationState();
    const { uiCaseMemory } = await runExplicitSwitchLifecycle(store);
    const locked = clientRefFromCaseMemory(uiCaseMemory)!;
    assert.equal(locked.clientId, BETA_UUID);
    assert.equal(isPronounDebtFollowUpQuery(DEBT_QUERY), true);
    assert.equal(isLockedClientDebtStatusQuery(DEBT_QUERY), true);
    assert.equal(querySuggestsDifferentClient(DEBT_QUERY, locked), false);

    const debtResolved = await resolveClient({
      query: DEBT_QUERY,
      lockedClientRef: locked,
      searchFn: async () => {
        throw new Error("must_not_search");
      },
    });
    assert.equal(debtResolved.outcome, "RESOLVED_LOCKED");
    assert.equal(debtResolved.clientRef?.clientId, BETA_UUID);
    const finance = financeById(debtResolved.clientRef!.clientId);
    assert.equal(finance.clientId, BETA_UUID);
    assert.equal(finance.contractAmountCents, 310000);
    assert.equal(finance.paidAmountCents, 210000);
    assert.equal(finance.balanceCents, 100000);
    assert.notEqual(finance.balanceCents, 125000);
  });
});

describe("SWITCH_PREVIOUS_CLIENT_DRAFT_NOT_ACTIVE", () => {
  it("transform after switch does not rewrite ALPHA reminder under BETA", async () => {
    const store = seedAlphaConversationState();
    const alphaDraft = formatDebtReminderLetter({
      displayName: ALPHA_LABEL,
      email: "ai-synthetic-alpha@example.com",
      contractAmount: "2 000 €",
      contractAmountCents: 200000,
      paidAmount: "750 €",
      balance: "1 250 €",
      balanceCents: 125000,
    });
    const { uiCaseMemory } = await runExplicitSwitchLifecycle(store);
    assert.equal(isFollowUpTransformQuery(TRANSFORM), true);
    assert.equal(isClientDebtReminderLetterQuery(TRANSFORM), false);
    const plan = planFollowUpTransform({
      query: TRANSFORM,
      history: [{ role: "assistant", content: alphaDraft }],
      caseMemory: uiCaseMemory,
    });
    assert.equal(plan, null, "ALPHA draft must not be active under BETA");
  });
});

describe("SWITCH_VOLATILE_FINANCE_REFETCH_NEW_CLIENT", () => {
  it("volatile debt follow-up reuses BETA and signals live refetch", async () => {
    const store = seedAlphaConversationState();
    const { uiCaseMemory } = await runExplicitSwitchLifecycle(store);
    const locked = clientRefFromCaseMemory(uiCaseMemory)!;
    assert.equal(queryRequiresVolatileRefetch(VOLATILE_DEBT), true);
    const resolved = await resolveClient({
      query: VOLATILE_DEBT,
      lockedClientRef: locked,
      searchFn: async () => {
        throw new Error("volatile_must_reuse_lock");
      },
    });
    assert.equal(resolved.clientRef?.clientId, BETA_UUID);
    assert.equal(financeById(resolved.clientRef!.clientId).balanceCents, 100000);
  });
});

describe("GENERAL_TASK_NO_STALE_CLIENT_EVIDENCE", () => {
  it("apostille question is non-client and skips EvidencePack ingress", () => {
    const task = classifyCurrentTask({ query: APOSTILLE });
    assert.ok(
      task.taskClass === "KNOWLEDGE" || task.taskClass === "GENERAL_GENERATION",
    );
    assert.equal(taskRequiresClientRef(task), false);
    assert.deepEqual(task.requiredProjections, []);
    const migrated = isMigratedClientModelPath({
      hasClientRef: true,
      modelRequired: task.modelRequired,
      requiredProjectionCount: task.requiredProjections.length,
    });
    assert.equal(migrated, false);
    const ingress = selectClientModelIngress({
      migratedClientModelPath: false,
      evidencePackText: null,
    });
    assert.equal(ingress.evidencePackText, null);
    assert.equal(ingress.broadClientFallbackToModel, false);
  });
});
