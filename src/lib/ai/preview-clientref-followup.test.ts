/**
 * Preview smoke regression — ClientRef follow-up across UI/SSE lifecycle.
 * Synthetic IDs only; no live Astra / DB writes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createClientRef,
  isQuestionnaireUuid,
} from "@/lib/ai/client-ref";
import {
  applyClientRefLockTransition,
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
  extractNameFromDebtQuery,
  formatFinanceClientDebtReply,
  isFinanceNamedClientDebtQuery,
  isLockedClientDebtStatusQuery,
  isPronounDebtFollowUpQuery,
  resolveFinanceDebtNameHint,
} from "@/lib/ai/finance-debt-query";
import {
  querySuggestsDifferentClient,
  resolveClient,
} from "@/lib/ai/resolve-client";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";
import type { SafeClientRecord } from "@/lib/ai/workspace-tools/client-tools";
import {
  mergeStreamCaseMemoryUpdate,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";

const ALPHA_UUID = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";
const BETA_UUID = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1";

function synthSafe(): SafeClientRecord {
  return {
    clientId: ALPHA_UUID,
    name: "AI TEST CLIENT ALPHA",
    latinName: "AI TEST CLIENT ALPHA",
    passport: "XX9999999",
    email: "ai-synthetic-alpha@example.com",
    phone: "+15555550101",
    status: "Документы на проверке",
    manager: null,
    partner: null,
    submittedAt: "2026-01-01",
    bookingAddress: "Secret Street 1",
    bookingRange: null,
    approvalAt: null,
    residenceCardIssuedAt: null,
    expectedApprovalAt: null,
    notes: "AI_SYNTHETIC_SMOKE_TEST",
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

function synthFinance(): PortalFinanceSnapshot {
  return {
    clientId: ALPHA_UUID,
    name: "AI TEST CLIENT ALPHA",
    email: "ai-synthetic-alpha@example.com",
    contractAmount: "€2,000.00",
    contractAmountCents: 200000,
    paidAmount: "€750.00",
    paidAmountCents: 75000,
    balance: "€1,250.00",
    balanceCents: 125000,
    paymentStatus: "partial",
    contractLabel: null,
    staffContractAmount: null,
  };
}

describe("full-profile natural Russian forms", () => {
  const forms = [
    "Вся информация по клиенту Тестовой",
    "Найди всю информацию по клиенту AI TEST CLIENT ALPHA",
    "Покажи всю информацию о клиенте Ивановой",
    "Дай всю информацию по клиенту Петрову",
    "Нужна вся информация о клиенте Сидоровой",
  ];

  for (const query of forms) {
    it(`classifies: ${query.slice(0, 48)}`, () => {
      const task = classifyCurrentTask({ query });
      assert.equal(task.taskClass, "CLIENT_SUMMARY");
      assert.deepEqual(task.requiredProjections, ["FULL_SAFE_PROFILE"]);
      assert.equal(task.modelRequired, true);
      assert.equal(taskRequiresClientRef(task), true);
      assert.equal(
        isMigratedClientModelPath({
          hasClientRef: true,
          modelRequired: task.modelRequired,
          requiredProjectionCount: task.requiredProjections.length,
        }),
        true,
      );
    });
  }
});

describe("pronoun debt follow-ups", () => {
  it("C: locked client → Какой у него долг? reuses lock cue", () => {
    assert.equal(isPronounDebtFollowUpQuery("Какой у него долг?"), true);
    assert.equal(isLockedClientDebtStatusQuery("Какой у него долг?"), true);
    assert.equal(extractNameFromDebtQuery("Какой у него долг?"), null);
    assert.equal(isFinanceNamedClientDebtQuery("Какой у него долг?"), false);
  });

  it("D: locked client → Какой у неё долг?", () => {
    assert.equal(isPronounDebtFollowUpQuery("Какой у неё долг?"), true);
    assert.equal(extractNameFromDebtQuery("Какой у неё долг?"), null);
    assert.equal(isLockedClientDebtStatusQuery("Сколько она должна?"), true);
  });

  it("E: no lock → pronoun must not become lookup name", () => {
    assert.equal(resolveFinanceDebtNameHint("Какой у него долг?"), null);
    assert.equal(extractNameFromDebtQuery("Какой у него долг?"), null);
    assert.equal(extractNameFromDebtQuery("Сколько он должен?"), null);
  });

  it("named debt still extracts surnames", () => {
    assert.equal(
      extractNameFromDebtQuery("Скажи какой долг у Мазуриной"),
      "Мазуриной",
    );
    assert.equal(isFinanceNamedClientDebtQuery("долг у Ивановой"), true);
  });
});

describe("ClientRef SSE / UI round-trip", () => {
  it("F: early null cannot wipe later lock (UI-faithful merge)", () => {
    const lock = lockClientRefIntoCaseMemory(
      null,
      createClientRef({
        clientId: ALPHA_UUID,
        displayLabel: "AI TEST CLIENT ALPHA",
      })!,
    );
    let ui: WorkspaceCaseMemory | null | undefined;
    ui = mergeStreamCaseMemoryUpdate(ui, undefined, false);
    assert.equal(ui, undefined);
    ui = mergeStreamCaseMemoryUpdate(ui, null, true);
    assert.equal(ui, null);
    ui = mergeStreamCaseMemoryUpdate(ui, lock, true);
    assert.equal(clientRefFromCaseMemory(ui)?.clientId, ALPHA_UUID);
    ui = mergeStreamCaseMemoryUpdate(ui, null, true);
    assert.equal(clientRefFromCaseMemory(ui)?.clientId, ALPHA_UUID);
  });

  it("G: switch client after lock — old ClientRef cannot bleed", () => {
    const alpha = createClientRef({
      clientId: ALPHA_UUID,
      displayLabel: "AI TEST CLIENT ALPHA",
    })!;
    const beta = createClientRef({
      clientId: BETA_UUID,
      displayLabel: "AI TEST CLIENT BETA",
    })!;
    const blocked = applyClientRefLockTransition({
      previous: alpha,
      next: beta,
      switchExplicit: false,
    });
    assert.equal(blocked.stalePrevented, true);
    assert.equal(blocked.active?.clientId, ALPHA_UUID);

    const switched = applyClientRefLockTransition({
      previous: alpha,
      next: beta,
      switchExplicit: true,
    });
    assert.equal(switched.switched, true);
    assert.equal(switched.active?.clientId, BETA_UUID);
  });
});

describe("UI-faithful two-turn Preview smoke sequence", () => {
  it("Turn1 full profile → EvidencePack+Finance; Turn2 pronoun reuses ALPHA", async () => {
    const turn1Query =
      "Найди всю информацию по клиенту AI TEST CLIENT ALPHA";

    const task = classifyCurrentTask({ query: turn1Query });
    assert.equal(task.taskClass, "CLIENT_SUMMARY");
    assert.deepEqual(task.requiredProjections, ["FULL_SAFE_PROFILE"]);
    assert.ok(isQuestionnaireUuid(ALPHA_UUID));

    const ref = createClientRef({
      clientId: ALPHA_UUID,
      displayLabel: "AI TEST CLIENT ALPHA",
    })!;
    const finance = synthFinance();
    const pack = buildEvidencePack({
      task,
      clientRef: ref,
      safe: synthSafe(),
      finance,
      documents: [],
    });
    assert.ok(pack.projections.CONTACT);
    assert.ok(pack.projections.CASE);
    assert.ok(pack.projections.FINANCE);
    assert.equal(pack.projections.FINANCE?.debtAmount, 1250);
    assert.equal(pack.projections.FINANCE?.contractAmount, 2000);
    assert.equal(pack.projections.FINANCE?.paidAmount, 750);
    assert.equal(pack.projections.FINANCE?.currency, "EUR");
    assert.equal(assertNoHighSensitivityInPack(pack).ok, true);

    const ingress = selectClientModelIngress({
      migratedClientModelPath: true,
      evidencePackText: formatEvidencePackForModel(pack),
    });
    assert.equal(ingress.allowBroadClientContext, false);
    assert.equal(ingress.broadClientFallbackToModel, false);
    assert.ok(ingress.evidencePackText);

    const serverLock = lockClientRefIntoCaseMemory(null, ref);
    let uiCaseMemory: WorkspaceCaseMemory | null | undefined;
    uiCaseMemory = mergeStreamCaseMemoryUpdate(uiCaseMemory, undefined, false);
    uiCaseMemory = mergeStreamCaseMemoryUpdate(uiCaseMemory, serverLock, true);
    assert.equal(
      clientRefFromCaseMemory(uiCaseMemory)?.clientId,
      ALPHA_UUID,
    );

    const turn2Query = "Какой у него долг?";
    assert.equal(extractNameFromDebtQuery(turn2Query), null);
    assert.equal(resolveFinanceDebtNameHint(turn2Query), null);
    assert.equal(isPronounDebtFollowUpQuery(turn2Query), true);
    assert.equal(isLockedClientDebtStatusQuery(turn2Query), true);

    const locked = clientRefFromCaseMemory(uiCaseMemory);
    assert.ok(locked);
    assert.equal(querySuggestsDifferentClient(turn2Query, locked), false);

    const resolved = await resolveClient({
      query: turn2Query,
      lockedClientRef: locked,
      searchFn: async () => {
        throw new Error("must not search when lock reused");
      },
    });
    assert.equal(resolved.outcome, "RESOLVED_LOCKED");
    assert.equal(resolved.reusedLock, true);
    assert.equal(resolved.clientRef?.clientId, ALPHA_UUID);

    const contractCents = 200000;
    const paidCents = 75000;
    const debtCents = contractCents - paidCents;
    assert.equal(debtCents, 125000);
    const reply = formatFinanceClientDebtReply({
      name: "AI TEST CLIENT ALPHA",
      email: "ai-synthetic-alpha@example.com",
      contractAmount: "€2,000.00",
      contractAmountCents: contractCents,
      paidAmount: "€750.00",
      balance: "€1,250.00",
      balanceCents: debtCents,
      nameHint: "AI TEST CLIENT ALPHA",
    });
    assert.match(reply, /1[,.\s\u00a0]?250|1250/i);
    assert.doesNotMatch(reply, /«него»|Клиент «него»/i);
  });
});
