/**
 * EvidencePack ↔ model contract: canonical Finance + no unauthorized sensitive names.
 * Deterministic — no OpenRouter / Astra calls.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertNoHighSensitivityInPack,
  assertNoUnauthorizedSensitiveNamesInModelIngress,
  buildEvidencePack,
  formatEvidencePackForModel,
  projectFinance,
  selectClientModelIngress,
} from "@/lib/ai/evidence-pack";
import {
  classifyCurrentTask,
  isFollowUpTransformQuery,
} from "@/lib/ai/current-task";
import { createClientRef } from "@/lib/ai/client-ref";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";
import type { SafeClientRecord } from "@/lib/ai/workspace-tools/client-tools";
import { buildWorkspaceSystemPrompt } from "@/lib/ai/workspace-prompt";
import { GROUNDING_SYSTEM_RULES } from "@/lib/ai/answer-grounding";
import {
  lockClientRefIntoCaseMemory,
  clientRefFromCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import { mergeStreamCaseMemoryUpdate } from "@/lib/ai/workspace-case-memory";
import {
  extractNameFromDebtQuery,
  isLockedClientDebtStatusQuery,
  isPronounDebtFollowUpQuery,
  resolveFinanceDebtNameHint,
} from "@/lib/ai/finance-debt-query";
import {
  querySuggestsDifferentClient,
  resolveClient,
} from "@/lib/ai/resolve-client";

const ALPHA_UUID = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";

function synthSafe(): SafeClientRecord {
  return {
    clientId: ALPHA_UUID,
    name: "AI SYNTH ALPHA ZORIN",
    latinName: null,
    passport: "SHOULD_NOT_REACH_MODEL",
    email: "ai-synthetic-alpha@example.com",
    phone: "+10000000001",
    status: "submitted",
    manager: "Synthetic Manager",
    partner: null,
    submittedAt: "2026-01-01",
    bookingAddress: "SHOULD_NOT_REACH_MODEL",
    bookingRange: null,
    approvalAt: null,
    residenceCardIssuedAt: null,
    expectedApprovalAt: null,
    notes: "synthetic note",
    direction: "Хорватия",
    citizenship: "Testland",
    placeOfBirth: "SHOULD_NOT_REACH_MODEL",
    hasContract: true,
    contractLabel: null,
    contractAmount: null,
    employmentType: null,
    fields: [
      { label: "Номер паспорта", value: "XX-SECRET", empty: false },
      { label: "Дата рождения", value: "1990-01-01", empty: false },
      { label: "Адрес проживания", value: "Secret Ave 1", empty: false },
    ],
    source: "Заявки портала Emigrant",
  };
}

/** ALPHA-like Finance fixture: 2000 / 750 / 1250 EUR. */
function synthFinanceAlphaLike(): PortalFinanceSnapshot {
  return {
    clientId: ALPHA_UUID,
    name: "AI SYNTH ALPHA ZORIN",
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

describe("FULL_SAFE_PROFILE_FINANCE_MODEL_CONTRACT", () => {
  it("canonical Finance schema reaches model-visible EvidencePack", () => {
    const task = classifyCurrentTask({
      query: "Найди всю информацию по клиенту AI SYNTH ALPHA ZORIN",
    });
    assert.equal(task.taskClass, "CLIENT_SUMMARY");
    assert.deepEqual(task.requiredProjections, ["FULL_SAFE_PROFILE"]);

    const finance = projectFinance(synthFinanceAlphaLike());
    assert.equal(finance.contractAmount, 2000);
    assert.equal(finance.paidAmount, 750);
    assert.equal(finance.debtAmount, 1250);
    assert.equal(finance.currency, "EUR");
    assert.equal("balance" in finance, false);

    const pack = buildEvidencePack({
      task,
      clientRef: createClientRef({
        clientId: ALPHA_UUID,
        displayLabel: "AI SYNTH ALPHA ZORIN",
      })!,
      safe: synthSafe(),
      finance: synthFinanceAlphaLike(),
      documents: [],
    });

    assert.equal(pack.projections.FINANCE?.contractAmount, 2000);
    assert.equal(pack.projections.FINANCE?.paidAmount, 750);
    assert.equal(pack.projections.FINANCE?.debtAmount, 1250);
    assert.equal(pack.projections.FINANCE?.currency, "EUR");

    const text = formatEvidencePackForModel(pack);
    assert.match(text, /FINANCE \(authoritative\)/);
    assert.match(text, /- contractAmount: 2000/);
    assert.match(text, /- paidAmount: 750/);
    assert.match(text, /- debtAmount: 1250/);
    assert.match(text, /- currency: EUR/);
    assert.doesNotMatch(text, /\bbalance\b/);

    const prompt = buildWorkspaceSystemPrompt("brief");
    assert.match(prompt, /EVIDENCE PACK/);
    assert.match(prompt, /debtAmount/);
    assert.match(prompt, /currency/);
    assert.match(GROUNDING_SYSTEM_RULES, /EVIDENCE PACK/);
    assert.match(prompt, /не говори «данных Finance нет»/i);

    const ingress = selectClientModelIngress({
      migratedClientModelPath: true,
      evidencePackText: text,
    });
    assert.equal(ingress.allowBroadClientContext, false);
    assert.equal(ingress.broadClientFallbackToModel, false);
    assert.ok(ingress.evidencePackText?.includes("contractAmount: 2000"));
  });
});

describe("UNAUTHORIZED_SENSITIVE_KEYS_ABSENT_FROM_MODEL_INGRESS", () => {
  it("omits passport/DOB/address keys and category names from EvidencePack text", () => {
    const task = classifyCurrentTask({
      query: "Найди всю информацию по клиенту AI SYNTH ALPHA ZORIN",
    });
    const pack = buildEvidencePack({
      task,
      clientRef: createClientRef({
        clientId: ALPHA_UUID,
        displayLabel: "AI SYNTH ALPHA ZORIN",
      })!,
      safe: synthSafe(),
      finance: synthFinanceAlphaLike(),
      documents: [],
    });

    assert.equal(assertNoHighSensitivityInPack(pack).ok, true);
    assert.equal("passport" in (pack.projections.CONTACT as object), false);
    assert.ok(pack.projections.CONTACT?.displayName);
    assert.ok(pack.projections.CASE?.status);
    assert.ok(pack.projections.FINANCE?.debtAmount === 1250);

    const text = formatEvidencePackForModel(pack);
    const sensitive = assertNoUnauthorizedSensitiveNamesInModelIngress(text);
    assert.equal(sensitive.ok, true, sensitive.leaks.join(","));
    assert.doesNotMatch(
      text,
      /passportNumber|dateOfBirth|homeAddress|residentialAddress|High-sensitivity/i,
    );
    assert.doesNotMatch(text, /SHOULD_NOT_REACH_MODEL|XX-SECRET|Secret Ave/);
  });
});

describe("CLIENTREF_TWO_TURN_REGRESSION", () => {
  it("Turn1 EvidencePack finance + Turn2 pronoun reuses same ClientRef", async () => {
    const turn1 =
      "Найди всю информацию по клиенту AI SYNTH ALPHA ZORIN";
    const task = classifyCurrentTask({ query: turn1 });
    assert.equal(task.taskClass, "CLIENT_SUMMARY");

    const ref = createClientRef({
      clientId: ALPHA_UUID,
      displayLabel: "AI SYNTH ALPHA ZORIN",
    })!;
    const pack = buildEvidencePack({
      task,
      clientRef: ref,
      safe: synthSafe(),
      finance: synthFinanceAlphaLike(),
    });
    assert.equal(pack.projections.FINANCE?.debtAmount, 1250);

    const serverLock = lockClientRefIntoCaseMemory(null, ref);
    let uiCaseMemory = mergeStreamCaseMemoryUpdate(undefined, serverLock, true);
    assert.equal(
      clientRefFromCaseMemory(uiCaseMemory)?.clientId,
      ALPHA_UUID,
    );

    const turn2 = "Какой у него долг?";
    assert.equal(extractNameFromDebtQuery(turn2), null);
    assert.equal(resolveFinanceDebtNameHint(turn2), null);
    assert.equal(isPronounDebtFollowUpQuery(turn2), true);
    assert.equal(isLockedClientDebtStatusQuery(turn2), true);

    const locked = clientRefFromCaseMemory(uiCaseMemory)!;
    assert.equal(querySuggestsDifferentClient(turn2, locked), false);
    const resolved = await resolveClient({
      query: turn2,
      lockedClientRef: locked,
      searchFn: async () => {
        throw new Error("must not search when lock reused");
      },
    });
    assert.equal(resolved.outcome, "RESOLVED_LOCKED");
    assert.equal(resolved.clientRef?.clientId, ALPHA_UUID);

    assert.equal(isFollowUpTransformQuery("Сделай короче и теплее"), true);
  });
});
