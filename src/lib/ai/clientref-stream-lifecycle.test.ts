/**
 * Full-profile model-stream ClientRef lifecycle — UI-faithful synthetic regression.
 * No OpenRouter / DB / production fixtures.
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
  mergeStreamCaseMemoryUpdate,
  selectAuthoritativeCaseMemory,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";

const FEMALE_UUID = "f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1";
const FEMALE_LABEL = "AI SYNTH FEMALE CLIENT";
const MALE_UUID = "c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1";
const MALE_LABEL = "AI SYNTH MALE CLIENT";
const ALPHA_UUID = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";
const BETA_UUID = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1";

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

/**
 * Simulate FULL_SAFE_PROFILE model-stream SSE meta sequence used by
 * runWorkspaceAiStream after prepare has locked ClientRef.
 */
function simulateFullProfileStreamLifecycle(params: {
  preparedLock: WorkspaceCaseMemory;
  refreshedStore?: WorkspaceCaseMemory | null;
  interruptAfterEarly?: boolean;
}): {
  earlyClientId: string | null;
  finalClientId: string | null;
  uiPersisted: WorkspaceCaseMemory | null | undefined;
  nextPostClientId: string | null;
} {
  let ui: WorkspaceCaseMemory | null | undefined;

  const early = caseMemoryForStreamMeta({
    prepared: params.preparedLock,
    phase: "early",
  });
  if (early !== undefined) {
    ui = mergeStreamCaseMemoryUpdate(ui, early, true);
  }

  const earlyClientId = clientRefFromCaseMemory(ui ?? null)?.clientId ?? null;

  if (params.interruptAfterEarly) {
    // No final meta — UI must still hold the early authoritative lock.
    return {
      earlyClientId,
      finalClientId: null,
      uiPersisted: ui,
      nextPostClientId: clientRefFromCaseMemory(ui ?? null)?.clientId ?? null,
    };
  }

  // Late store refresh without linkedClientId must not erase prepare lock.
  const finalMem = caseMemoryForStreamMeta({
    prepared: params.preparedLock,
    refreshed: params.refreshedStore ?? {
      clientName: "stale store name",
      citizenship: null,
      passport: null,
      applicationPlace: null,
      priorResidency: null,
      employers: null,
      dates: null,
      specialNotes: "store notes",
      openQuestions: null,
      linkedClientId: null,
      draftClientId: null,
      updatedAt: new Date().toISOString(),
    },
    phase: "final",
  });
  ui = mergeStreamCaseMemoryUpdate(ui, finalMem ?? null, true);

  const finalClientId = clientRefFromCaseMemory(ui ?? null)?.clientId ?? null;
  return {
    earlyClientId,
    finalClientId,
    uiPersisted: ui,
    nextPostClientId: finalClientId,
  };
}

async function assertPronounDebtReuses(
  ui: WorkspaceCaseMemory | null | undefined,
  query: string,
  expectedId: string,
  expectedDebtCents: number,
) {
  assert.equal(isPronounDebtFollowUpQuery(query), true, query);
  assert.equal(isLockedClientDebtStatusQuery(query), true, query);
  const locked = clientRefFromCaseMemory(ui ?? null);
  assert.ok(locked, query);
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

  const finance = femaleFinance();
  assert.equal(finance.clientId, expectedId);
  assert.equal(finance.balanceCents, expectedDebtCents);
  const reply = formatFinanceClientDebtReply({
    name: FEMALE_LABEL,
    email: finance.email,
    contractAmount: finance.contractAmount,
    contractAmountCents: finance.contractAmountCents,
    paidAmount: finance.paidAmount,
    balance: finance.balance,
    balanceCents: finance.balanceCents,
    nameHint: FEMALE_LABEL,
  });
  assert.match(reply, /1[,.\s\u00a0]?000|1000/i);
}

describe("FULL_PROFILE_STREAM_CLIENTREF_LIFECYCLE", () => {
  it("Turn1 full-profile stream emits early+final ClientRef; female/male pronouns reuse", async () => {
    const task = classifyCurrentTask({ query: FULL_PROFILE_Q });
    assert.equal(task.taskClass, "CLIENT_SUMMARY");
    assert.deepEqual(task.requiredProjections, ["FULL_SAFE_PROFILE"]);
    assert.equal(taskRequiresClientRef(task), true);

    const ref = femaleRef();
    assert.equal(Boolean(ref), true); // CLIENTREF_CREATED

    const pack = buildEvidencePack({
      task,
      clientRef: ref,
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
    assert.equal(pack.projections.FINANCE?.debtAmount, 1000);
    assert.equal(assertNoHighSensitivityInPack(pack).ok, true);
    assert.doesNotMatch(
      formatEvidencePackForModel(pack),
      /documentContent|ocr|passportNumber/i,
    );

    const migrated = isMigratedClientModelPath({
      hasClientRef: true,
      modelRequired: true,
      requiredProjectionCount: task.requiredProjections.length,
    });
    const ingress = selectClientModelIngress({
      migratedClientModelPath: migrated,
      evidencePackText: formatEvidencePackForModel(pack),
    });
    assert.equal(ingress.allowBroadClientContext, false);
    assert.equal(ingress.broadClientFallbackToModel, false);

    const preparedLock = lockClientRefIntoCaseMemory(null, ref);
    const life = simulateFullProfileStreamLifecycle({ preparedLock });

    assert.equal(life.earlyClientId, FEMALE_UUID);
    assert.equal(life.finalClientId, FEMALE_UUID);
    assert.equal(
      clientRefFromCaseMemory(life.uiPersisted ?? null)?.clientId,
      FEMALE_UUID,
    );
    assert.equal(life.nextPostClientId, FEMALE_UUID);

    await assertPronounDebtReuses(life.uiPersisted, DEBT_NEYA, FEMALE_UUID, 100000);
    await assertPronounDebtReuses(life.uiPersisted, DEBT_NYO, FEMALE_UUID, 100000);
    await assertPronounDebtReuses(life.uiPersisted, DEBT_NEGO, FEMALE_UUID, 100000);
  });

  it("stream interruption after early ClientRef does not erase lock", () => {
    const preparedLock = lockClientRefIntoCaseMemory(null, femaleRef());
    const life = simulateFullProfileStreamLifecycle({
      preparedLock,
      interruptAfterEarly: true,
    });
    assert.equal(life.earlyClientId, FEMALE_UUID);
    assert.equal(life.finalClientId, null);
    assert.equal(life.nextPostClientId, FEMALE_UUID);
    // Accidental null final meta must not wipe either.
    let ui = life.uiPersisted;
    ui = mergeStreamCaseMemoryUpdate(ui, null, true);
    assert.equal(clientRefFromCaseMemory(ui ?? null)?.clientId, FEMALE_UUID);
  });

  it("selectAuthoritativeCaseMemory never lets store null overwrite prepare lock", () => {
    const prepared = lockClientRefIntoCaseMemory(null, femaleRef());
    const refreshed: WorkspaceCaseMemory = {
      clientName: "other",
      citizenship: null,
      passport: null,
      applicationPlace: null,
      priorResidency: null,
      employers: null,
      dates: null,
      specialNotes: "from store",
      openQuestions: null,
      linkedClientId: null,
      draftClientId: null,
      updatedAt: new Date().toISOString(),
    };
    const auth = selectAuthoritativeCaseMemory({ prepared, refreshed });
    assert.equal(auth?.linkedClientId, FEMALE_UUID);
  });

  it("incoming SSE facts without linkedClientId preserve existing lock", () => {
    let ui = lockClientRefIntoCaseMemory(null, femaleRef());
    ui = mergeStreamCaseMemoryUpdate(
      ui,
      {
        clientName: "fact update",
        citizenship: null,
        passport: null,
        applicationPlace: null,
        priorResidency: null,
        employers: null,
        dates: null,
        specialNotes: "n",
        openQuestions: null,
        linkedClientId: null,
        draftClientId: null,
        updatedAt: new Date().toISOString(),
      },
      true,
    ) as WorkspaceCaseMemory;
    assert.equal(ui.linkedClientId, FEMALE_UUID);
    assert.equal(ui.clientName, "fact update");
  });
});

describe("STREAM_LIFECYCLE_SWITCH_AND_GENERAL", () => {
  it("explicit switch BETA survives store merge; pronoun uses BETA", async () => {
    const alpha = createClientRef({
      clientId: ALPHA_UUID,
      displayLabel: "AI SYNTH ALPHA ZORIN",
    })!;
    const beta = createClientRef({
      clientId: BETA_UUID,
      displayLabel: "AI SYNTH BETA KAPLAN",
    })!;
    let mem = lockClientRefIntoCaseMemory(null, alpha);
    const switched = applyClientSwitch({
      memory: mem,
      previous: alpha,
      next: beta,
    });
    mem = switched.memory;
    assert.equal(clientRefFromCaseMemory(mem)?.clientId, BETA_UUID);

    const auth = selectAuthoritativeCaseMemory({
      prepared: mem,
      refreshed: lockClientRefIntoCaseMemory(null, alpha),
    });
    assert.equal(auth?.linkedClientId, BETA_UUID);

    const life = simulateFullProfileStreamLifecycle({ preparedLock: mem });
    assert.equal(life.nextPostClientId, BETA_UUID);

    const locked = clientRefFromCaseMemory(life.uiPersisted ?? null)!;
    const resolved = await resolveClient({
      query: DEBT_NEGO,
      lockedClientRef: locked,
      searchFn: async () => {
        throw new Error("no search");
      },
    });
    assert.equal(resolved.clientRef?.clientId, BETA_UUID);
  });

  it("general task keeps dormant ClientRef; follow-up reuses lock", async () => {
    const preparedLock = lockClientRefIntoCaseMemory(null, femaleRef());
    const life = simulateFullProfileStreamLifecycle({ preparedLock });
    const task = classifyCurrentTask({ query: APOSTILLE });
    assert.equal(taskRequiresClientRef(task), false);
    const ingress = caseMemoryForModelIngress({
      caseMemory: life.uiPersisted,
      taskRequiresClientRef: false,
      needsClients: false,
      fastClientLookup: false,
    });
    assert.equal(ingress, null);
    assert.equal(
      clientRefFromCaseMemory(life.uiPersisted ?? null)?.clientId,
      FEMALE_UUID,
    );
    await assertPronounDebtReuses(
      life.uiPersisted,
      DEBT_NEYA,
      FEMALE_UUID,
      100000,
    );
  });
});

describe("STREAM_LIFECYCLE_MALE_FIXTURE", () => {
  it("male full-profile stream + у него debt lock reuse", async () => {
    const ref = createClientRef({
      clientId: MALE_UUID,
      displayLabel: MALE_LABEL,
    })!;
    const preparedLock = lockClientRefIntoCaseMemory(null, ref);
    const life = simulateFullProfileStreamLifecycle({ preparedLock });
    assert.equal(life.earlyClientId, MALE_UUID);
    assert.equal(life.finalClientId, MALE_UUID);

    const locked = clientRefFromCaseMemory(life.uiPersisted ?? null)!;
    assert.equal(isPronounDebtFollowUpQuery(DEBT_NEGO), true);
    const resolved = await resolveClient({
      query: DEBT_NEGO,
      lockedClientRef: locked,
      searchFn: async () => {
        throw new Error("no search");
      },
    });
    assert.equal(resolved.outcome, "RESOLVED_LOCKED");
    assert.equal(resolved.clientRef?.clientId, MALE_UUID);
  });
});
