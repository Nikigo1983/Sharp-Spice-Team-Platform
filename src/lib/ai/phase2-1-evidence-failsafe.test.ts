/**
 * Phase 2.1 — EvidencePack failure must not fall back to broad CLIENT CONTEXT.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClientRef } from "@/lib/ai/client-ref";
import { classifyCurrentTask } from "@/lib/ai/current-task";
import {
  assertNoHighSensitivityInPack,
  buildEvidencePack,
  evidencePackFailureCode,
  formatEvidencePackForModel,
  isMigratedClientModelPath,
  selectClientModelIngress,
} from "@/lib/ai/evidence-pack";
import { assembleEvidencePack } from "@/lib/ai/evidence-pack-assemble";
import { aiErrorMessage, classifyAiFailure } from "@/lib/ai/errors";
import { resolveCompletionPrivacy } from "@/lib/ai/openai";
import {
  createEmptyWorkspaceAiTrace,
  serializeWorkspaceAiTraceForLog,
} from "@/lib/ai/workspace-trace";
import type { SafeClientRecord } from "@/lib/ai/workspace-tools/client-tools";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";

const UUID_A = "11111111-2222-4333-8444-555555555555";

function synthSafe(id = UUID_A): SafeClientRecord {
  return {
    clientId: id,
    name: "Тестова Анна",
    latinName: "Testova",
    passport: "XX9999999",
    email: "a@example.com",
    phone: "+10000000000",
    status: "В работе",
    manager: "M",
    partner: "P",
    submittedAt: "2026-01-01",
    bookingAddress: "Secret St 1",
    bookingRange: "01–05",
    approvalAt: null,
    residenceCardIssuedAt: null,
    expectedApprovalAt: null,
    notes: "note",
    direction: "Хорватия",
    citizenship: "РФ",
    placeOfBirth: "City",
    hasContract: true,
    contractLabel: "C",
    contractAmount: null,
    employmentType: null,
    fields: [
      { label: "Email", value: "a@example.com", empty: false },
      { label: "Номер паспорта", value: "XX9999999", empty: false },
    ],
    source: "portal",
  };
}

function synthFinance(id = UUID_A): PortalFinanceSnapshot {
  return {
    clientId: id,
    name: "Тестова",
    email: "a@example.com",
    contractAmount: "€100",
    contractAmountCents: 10000,
    paidAmount: "€40",
    balance: "€60",
    balanceCents: 6000,
    paymentStatus: "partial",
    contractLabel: "C",
    staffContractAmount: null,
  };
}

describe("Phase 2.1 EvidencePack fail-safe (no broad CLIENT CONTEXT)", () => {
  it("A: EvidencePack success → pack attached, CLIENT CONTEXT absent", () => {
    const task = classifyCurrentTask({
      query: "Напиши деликатное письмо оплатить долг",
    });
    assert.equal(
      isMigratedClientModelPath({
        hasClientRef: true,
        modelRequired: task.modelRequired,
        requiredProjectionCount: task.requiredProjections.length,
      }),
      true,
    );
    const pack = buildEvidencePack({
      task,
      clientRef: createClientRef({ clientId: UUID_A })!,
      safe: synthSafe(),
      finance: synthFinance(),
    });
    const text = formatEvidencePackForModel(pack);
    const ingress = selectClientModelIngress({
      migratedClientModelPath: true,
      evidencePackText: text,
    });
    assert.ok(ingress.evidencePackText);
    assert.equal(ingress.allowBroadClientContext, false);
    assert.equal(ingress.broadClientFallbackToModel, false);
    assert.equal(ingress.mustFailSafe, false);
    assert.doesNotMatch(text, /CLIENT CONTEXT|SafeClient|QuestionnaireRecord/i);
  });

  it("B: EvidencePack assembly failure → CLIENT CONTEXT absent", () => {
    const ingress = selectClientModelIngress({
      migratedClientModelPath: true,
      evidencePackText: null,
    });
    assert.equal(ingress.allowBroadClientContext, false);
    assert.equal(ingress.broadClientFallbackToModel, false);
    assert.equal(ingress.mustFailSafe, true);
    assert.equal(ingress.evidencePackText, null);
  });

  it("C: EvidencePack failure does not send raw SafeClient/QuestionnaireRecord", () => {
    const ingress = selectClientModelIngress({
      migratedClientModelPath: true,
      evidencePackText: null,
    });
    // Model ingress payload is empty of client dumps when fail-safe.
    const modelBlob = [
      ingress.evidencePackText ?? "",
      ingress.allowBroadClientContext ? "=== CLIENT CONTEXT ===" : "",
    ].join("\n");
    assert.doesNotMatch(modelBlob, /CLIENT CONTEXT|SafeClient|QuestionnaireRecord|passport/i);
  });

  it("D: EvidencePack failure returns typed safe error when no direct answer", async () => {
    const task = classifyCurrentTask({
      query: "Напиши деликатное письмо клиенту оплатить долг",
    });
    assert.equal(task.modelRequired, true);
    assert.ok(task.requiredProjections.length > 0);
    assert.equal(
      isMigratedClientModelPath({
        hasClientRef: true,
        modelRequired: task.modelRequired,
        requiredProjectionCount: task.requiredProjections.length,
      }),
      true,
    );

    const nullPack = await assembleEvidencePack({
      task,
      clientRef: createClientRef({ clientId: UUID_A })!,
      loaders: {
        getSafeClient: async () => null,
        getFinance: async () => null,
        listDocumentsMeta: async () => [],
      },
    });
    assert.equal(nullPack, null);

    const code = evidencePackFailureCode("null_pack");
    assert.equal(code, "SOURCE_UNAVAILABLE");
    assert.equal(classifyAiFailure(code), "SOURCE_UNAVAILABLE");
    assert.match(aiErrorMessage(code), /временно недоступен|повтор/i);

    const throwCode = evidencePackFailureCode("throw");
    assert.equal(throwCode, "INTERNAL_AI_ERROR");
    assert.equal(classifyAiFailure(throwCode), "INTERNAL_AI_ERROR");

    const ingress = selectClientModelIngress({
      migratedClientModelPath: true,
      evidencePackText: null,
    });
    assert.equal(ingress.mustFailSafe, true);
    assert.equal(ingress.allowBroadClientContext, false);
  });

  it("E: Direct structured fact remains modelRequired=false (no Astra)", () => {
    const email = classifyCurrentTask({ query: "Какой email у Тестовой?" });
    assert.equal(email.modelRequired, false);
    assert.equal(
      isMigratedClientModelPath({
        hasClientRef: true,
        modelRequired: email.modelRequired,
        requiredProjectionCount: email.requiredProjections.length,
      }),
      false,
    );
  });

  it("F: Non-client AI path remains outside migrated invariant", () => {
    const general = classifyCurrentTask({
      query: "Напиши короткое приветствие для команды",
    });
    assert.equal(
      isMigratedClientModelPath({
        hasClientRef: false,
        modelRequired: general.modelRequired,
        requiredProjectionCount: general.requiredProjections.length,
      }),
      false,
    );
    const ingress = selectClientModelIngress({
      migratedClientModelPath: false,
      evidencePackText: null,
    });
    assert.equal(ingress.mustFailSafe, false);
    assert.equal(ingress.allowBroadClientContext, true);
  });

  it("G: Security Gate 1 remains intact", () => {
    const privacy = resolveCompletionPrivacy({
      containsClientData: true,
      provider: "openrouter",
    });
    assert.equal(privacy.decision.ok, true);
    assert.equal(privacy.openRouterProvider?.allow_fallbacks, false);
    assert.equal(privacy.openRouterProvider?.data_collection, "deny");
    assert.equal(privacy.openRouterProvider?.zdr, true);

    const blocked = resolveCompletionPrivacy({
      containsClientData: true,
      provider: "openai",
    });
    assert.equal(blocked.decision.ok, false);
  });

  it("H: Phase 2 assertions + BROAD_CLIENT_FALLBACK_TO_MODEL = NO", () => {
    const pack = buildEvidencePack({
      task: classifyCurrentTask({
        query: "Напиши деликатное письмо оплатить долг",
      }),
      clientRef: createClientRef({ clientId: UUID_A })!,
      safe: synthSafe(),
      finance: synthFinance(),
    });
    assert.equal(assertNoHighSensitivityInPack(pack).ok, true);
    assert.ok(pack.projections.FINANCE?.balance);
    assert.doesNotMatch(formatEvidencePackForModel(pack), /CLIENT CONTEXT/);

    const failIngress = selectClientModelIngress({
      migratedClientModelPath: true,
      evidencePackText: null,
    });
    assert.equal(failIngress.broadClientFallbackToModel, false);
    assert.equal(failIngress.allowBroadClientContext, false);

    const trace = createEmptyWorkspaceAiTrace(
      "00000000-0000-4000-8000-0000000000e1",
    );
    trace.evidencePackUsed = false;
    trace.evidencePackAssemblyOutcome = "FAILED";
    trace.legacyPreloadUsed = false;
    trace.failureClass = "SOURCE_UNAVAILABLE";
    const s = JSON.stringify(serializeWorkspaceAiTraceForLog(trace));
    assert.match(s, /evidencePackAssemblyOutcome/);
    assert.doesNotMatch(s, /Тестова|XX9999999|@example/);
  });
});
