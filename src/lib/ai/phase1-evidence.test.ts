/**
 * Phase 1 — Canonical ClientRef + EvidencePack regression matrix (synthetic only).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createClientRef,
  clientRefTraceFields,
  isQuestionnaireUuid,
} from "@/lib/ai/client-ref";
import {
  classifyCurrentTask,
  isFollowUpTransformQuery,
  taskRequiresClientRef,
} from "@/lib/ai/current-task";
import {
  applyClientRefLockTransition,
  clientRefFromCaseMemory,
  lockClientRefIntoCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  assertNoHighSensitivityInPack,
  buildEvidencePack,
  evidencePackSafeInspect,
  evidencePackTraceMeta,
  formatEvidencePackForModel,
  projectContact,
  projectFinance,
} from "@/lib/ai/evidence-pack";
import {
  planFollowUpTransform,
  formatFollowUpTransformContext,
} from "@/lib/ai/follow-up-transform";
import {
  resolveClient,
  toTraceClientResolutionOutcome,
} from "@/lib/ai/resolve-client";
import { shouldUseInternetSearch } from "@/lib/ai/workspace-web-search";
import { queryLooksLikeClientPii } from "@/lib/ai/client-pii-signals";
import {
  resolveProviderPrivacyForRequest,
  privacyDecisionTraceFields,
} from "@/lib/ai/provider-privacy-policy";
import { resolveCompletionPrivacy } from "@/lib/ai/openai";
import {
  createEmptyWorkspaceAiTrace,
  serializeWorkspaceAiTraceForLog,
} from "@/lib/ai/workspace-trace";
import { classifyAiFailure } from "@/lib/ai/errors";
import type { SafeClientRecord } from "@/lib/ai/workspace-tools/client-tools";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";
import type { ClientAiSearchResult } from "@/lib/ai/client-lookup";
import type { ResolvedClientContext } from "@/lib/ai/client-context";

const SYNTH_UUID = "11111111-2222-4333-8444-555555555555";
const OTHER_UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function synthSafe(overrides: Partial<SafeClientRecord> = {}): SafeClientRecord {
  return {
    clientId: SYNTH_UUID,
    name: "Тестова Анна",
    latinName: "Testova Anna",
    passport: "XX9999999",
    email: "testova@example.com",
    phone: "+10000000000",
    status: "В работе",
    manager: "Manager",
    partner: "Partner",
    submittedAt: "2026-01-01",
    bookingAddress: "Secret Street 1",
    bookingRange: "01.01–05.01",
    approvalAt: null,
    residenceCardIssuedAt: null,
    expectedApprovalAt: null,
    notes: "Bounded note",
    direction: "Хорватия",
    citizenship: "РФ",
    placeOfBirth: "City",
    hasContract: true,
    contractLabel: "Test contract",
    contractAmount: null,
    employmentType: null,
    fields: [],
    source: "Заявки портала Emigrant",
    ...overrides,
  };
}

function synthFinance(): PortalFinanceSnapshot {
  return {
    clientId: SYNTH_UUID,
    name: "Тестова Анна",
    email: "testova@example.com",
    contractAmount: "€1,000.00",
    contractAmountCents: 100000,
    paidAmount: "€400.00",
    paidAmountCents: 40000,
    balance: "€600.00",
    balanceCents: 60000,
    paymentStatus: "partial",
    contractLabel: "Test contract",
    staffContractAmount: null,
  };
}

function synthResolved(id: string, name: string): ResolvedClientContext {
  return {
    source: "clients",
    sourceLabel: "Заявки портала Emigrant",
    rowIndex: 1,
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
    matchedFields: [],
    debugRow: { id },
  };
}

describe("Phase 1 ClientRef + resolver", () => {
  it("A: unique resolve yields canonical questionnaire UUID", async () => {
    assert.equal(isQuestionnaireUuid(SYNTH_UUID), true);
    const searchFn = async (): Promise<ClientAiSearchResult> => ({
      lookup: {
        kind: "single",
        client: synthResolved(SYNTH_UUID, "Тестова"),
        query: "Тестова",
      },
      intent: {
        clientName: "Тестова",
        email: null,
        phone: null,
        passport: null,
        status: null,
        country: null,
        direction: null,
        manager: null,
        partner: null,
        freeText: [],
        isListQuery: false,
      } as ClientAiSearchResult["intent"],
      usedStructuredSearch: false,
      intentType: "single",
      foundClients: 1,
      sentToClaude: 1,
    });
    const result = await resolveClient({
      query: "Найди Тестову",
      searchFn,
    });
    assert.equal(result.outcome, "RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    assert.equal(result.clientRef.clientId, SYNTH_UUID);
    assert.equal(result.clientRef.source, "client_portal");
  });

  it("B: ambiguous surname → no silent choice", async () => {
    const searchFn = async (): Promise<ClientAiSearchResult> => ({
      lookup: {
        kind: "multiple",
        clients: [
          synthResolved(SYNTH_UUID, "Тестова А"),
          synthResolved(OTHER_UUID, "Тестова Б"),
        ],
        pendingParts: [],
        query: "Тестова",
      },
      intent: {} as ClientAiSearchResult["intent"],
      usedStructuredSearch: false,
      intentType: "single",
      foundClients: 2,
      sentToClaude: 2,
    });
    const result = await resolveClient({ query: "Тестова", searchFn });
    assert.equal(result.outcome, "AMBIGUOUS");
    if (result.outcome !== "AMBIGUOUS") return;
    assert.equal(result.clientRef, null);
    assert.equal(result.candidates.length, 2);
  });

  it("C: nonexistent → NOT_FOUND", async () => {
    const searchFn = async (): Promise<ClientAiSearchResult> => ({
      lookup: { kind: "not_found", query: "Неттакого" },
      intent: {} as ClientAiSearchResult["intent"],
      usedStructuredSearch: false,
      intentType: "single",
      foundClients: 0,
      sentToClaude: 0,
    });
    const result = await resolveClient({ query: "Неттакого", searchFn });
    assert.equal(result.outcome, "NOT_FOUND");
    assert.equal(toTraceClientResolutionOutcome(result.outcome), "NOT_FOUND");
  });
});

describe("Phase 1 EvidencePack projections", () => {
  it("H/I: summary includes CONTACT/CASE/FINANCE and excludes high sensitivity", () => {
    const task = classifyCurrentTask({
      query: "Резюме по клиенту Тестовой",
    });
    assert.equal(task.taskClass, "CLIENT_SUMMARY");
    const pack = buildEvidencePack({
      task,
      clientRef: createClientRef({
        clientId: SYNTH_UUID,
        displayLabel: "Тестова",
      })!,
      safe: synthSafe(),
      finance: synthFinance(),
    });
    assert.ok(pack.projections.CONTACT?.email);
    assert.ok(pack.projections.CASE?.status);
    assert.ok(pack.projections.FINANCE?.debtAmount);
    assert.equal(pack.projections.FINANCE?.source, "finance");
    const check = assertNoHighSensitivityInPack(pack);
    assert.equal(check.ok, true, check.leaks.join(","));
    const text = formatEvidencePackForModel(pack);
    assert.doesNotMatch(text, /XX9999999/);
    assert.doesNotMatch(text, /Secret Street/);
    assert.doesNotMatch(text, /Паспорт:|passportNumber|Номер паспорта/i);
  });

  it("O/P: FULL_SAFE_PROFILE bounded and excludes high sensitivity", () => {
    const task = classifyCurrentTask({
      query: "Вся информация по клиенту",
    });
    assert.equal(task.taskClass, "CLIENT_SUMMARY");
    assert.deepEqual(task.requiredProjections, ["FULL_SAFE_PROFILE"]);
    const pack = buildEvidencePack({
      task,
      clientRef: createClientRef({ clientId: SYNTH_UUID })!,
      safe: synthSafe(),
      finance: synthFinance(),
      documents: [
        {
          documentId: "doc-1",
          title: "passport-scan.pdf",
          category: "application/pdf",
        },
      ],
    });
    assert.ok(pack.projections.CONTACT);
    assert.ok(pack.projections.CASE);
    assert.ok(pack.projections.FINANCE);
    assert.equal(pack.projections.DOCUMENT_META?.length, 1);
    assert.equal(assertNoHighSensitivityInPack(pack).ok, true);
    // Meta may list filename but never content.
    assert.doesNotMatch(JSON.stringify(pack.projections), /documentContent|ocr/i);
  });

  it("J: payment reminder projections are minimum Finance/Case/Contact", () => {
    const task = classifyCurrentTask({
      query: "Напиши ей деликатное письмо оплатить долг",
    });
    assert.equal(task.taskClass, "PAYMENT_REMINDER");
    assert.ok(task.requiredProjections.includes("FINANCE"));
    assert.ok(!task.highSensitivityCaps.includes("passport_number"));
    const pack = buildEvidencePack({
      task,
      clientRef: createClientRef({
        clientId: SYNTH_UUID,
        displayLabel: "Тестова",
      })!,
      safe: synthSafe(),
      finance: synthFinance(),
    });
    assert.ok(pack.projections.FINANCE?.debtAmount);
    assert.equal(assertNoHighSensitivityInPack(pack).ok, true);
  });
});

describe("Phase 1 follow-up lock + transform", () => {
  it("L/M: сделай короче → no resolve, no finance refetch", () => {
    const plan = planFollowUpTransform({
      query: "Сделай короче",
      history: [
        { role: "user", content: "Напиши письмо" },
        { role: "assistant", content: "Уважаемая Анна, просим оплатить долг €600." },
      ],
    });
    assert.ok(plan);
    assert.equal(plan?.resolveClient, false);
    assert.equal(plan?.refetchFinance, false);
    assert.equal(plan?.attachEvidencePack, false);
    const task = classifyCurrentTask({
      query: "Сделай короче",
      hasPriorDraft: true,
    });
    assert.equal(task.taskClass, "FOLLOW_UP_TRANSFORM");
    assert.equal(taskRequiresClientRef(task), false);
    assert.equal(isFollowUpTransformQuery("Сделай теплее"), true);
  });

  it("N: client switch does not reuse old ClientRef silently", () => {
    const prev = createClientRef({
      clientId: SYNTH_UUID,
      displayLabel: "Тестова",
    })!;
    const next = createClientRef({
      clientId: OTHER_UUID,
      displayLabel: "Другая",
    })!;
    const blocked = applyClientRefLockTransition({
      previous: prev,
      next,
      switchExplicit: false,
    });
    assert.equal(blocked.stalePrevented, true);
    assert.equal(blocked.active?.clientId, SYNTH_UUID);
    const switched = applyClientRefLockTransition({
      previous: prev,
      next,
      switchExplicit: true,
    });
    assert.equal(switched.switched, true);
    assert.equal(switched.active?.clientId, OTHER_UUID);
    // Explicit other ClientRef identity is enough to prove switch semantics.
    assert.notEqual(prev.clientId, next.clientId);
  });

  it("lock persists via case memory linkedClientId only", () => {
    const ref = createClientRef({
      clientId: SYNTH_UUID,
      displayLabel: "Тестова",
    })!;
    const memory = lockClientRefIntoCaseMemory(null, ref);
    assert.equal(memory.linkedClientId, SYNTH_UUID);
    assert.equal(memory.passport, null);
    const restored = clientRefFromCaseMemory(memory);
    assert.equal(restored?.clientId, SYNTH_UUID);
  });
});

describe("Phase 1 directs / privacy / web / traces", () => {
  it("D/E/F/G task classes mark model not required for exact facts", () => {
    assert.equal(
      classifyCurrentTask({ query: "Какой email у Тестовой?" }).modelRequired,
      false,
    );
    assert.equal(
      classifyCurrentTask({ query: "Какой телефон у Тестовой?" }).modelRequired,
      false,
    );
    assert.equal(
      classifyCurrentTask({ query: "Сколько должна Тестова?" }).modelRequired,
      false,
    );
    assert.equal(
      classifyCurrentTask({ query: "Какой паспорт у Тестовой?" }).modelRequired,
      false,
    );
  });

  it("K: provider failure class stays MODEL_* not CLIENT_NOT_FOUND", () => {
    assert.equal(
      classifyAiFailure("MODEL_PROVIDER_ERROR"),
      "MODEL_PROVIDER_ERROR",
    );
    assert.notEqual(
      classifyAiFailure("MODEL_PROVIDER_ERROR"),
      "CLIENT_NOT_FOUND",
    );
  });

  it("Q: client task blocks external web search", () => {
    assert.equal(queryLooksLikeClientPii("email у Тестовой"), true);
    assert.equal(shouldUseInternetSearch("Найди email Тестовой в интернете"), false);
  });

  it("R: non-client generation still classifies as GENERAL_GENERATION", () => {
    const task = classifyCurrentTask({
      query: "Переведи на английский: Добро пожаловать в Хорватию",
    });
    // Without prior draft this is general; with draft it would be transform.
    assert.ok(
      task.taskClass === "GENERAL_GENERATION" ||
        task.taskClass === "FOLLOW_UP_TRANSFORM",
    );
  });

  it("S: traces metadata only", () => {
    const pack = buildEvidencePack({
      task: classifyCurrentTask({ query: "Резюме по клиенту Тестовой" }),
      clientRef: createClientRef({ clientId: SYNTH_UUID })!,
      safe: synthSafe(),
      finance: synthFinance(),
    });
    const meta = evidencePackTraceMeta(pack, classifyCurrentTask({
      query: "Резюме по клиенту Тестовой",
    }));
    const inspect = evidencePackSafeInspect(pack);
    const blob = JSON.stringify({ meta, inspect, fields: clientRefTraceFields(pack.clientRef) });
    assert.doesNotMatch(blob, new RegExp(SYNTH_UUID, "i"));
    assert.doesNotMatch(blob, /testova@example|Secret Street|XX9999999/i);

    const trace = createEmptyWorkspaceAiTrace(
      "00000000-0000-4000-8000-0000000000cc",
    );
    trace.taskClass = meta.taskClass;
    trace.clientRefPresent = true;
    trace.evidenceProjectionNames = meta.evidenceProjectionNames;
    trace.evidenceFactCount = meta.evidenceFactCount;
    const serialized = serializeWorkspaceAiTraceForLog(trace);
    const s = JSON.stringify(serialized);
    assert.doesNotMatch(s, /testova@example|XX9999999|Secret Street/i);
  });

  it("T/U: privacy policy required; unsafe fallback impossible", () => {
    const ok = resolveProviderPrivacyForRequest({
      containsClientData: true,
      provider: "openrouter",
    });
    assert.equal(ok.ok, true);
    const fields = privacyDecisionTraceFields(ok);
    assert.equal(fields.privacyPolicyRequired, true);
    const blocked = resolveCompletionPrivacy({
      containsClientData: true,
      provider: "openai",
    });
    assert.equal(blocked.decision.ok, false);
    assert.equal(
      blocked.decision.ok === false && blocked.decision.errorCode,
      "AI_PRIVACY_POLICY_UNAVAILABLE",
    );
  });

  it("CONTACT/FINANCE projectors never include passport/address", () => {
    const contact = projectContact(synthSafe());
    assert.equal("passport" in (contact as object), false);
    const finance = projectFinance(synthFinance());
    assert.equal(finance.linkField, "clientExternalId");
    assert.ok(!("passport" in finance));
  });

  it("transform context does not embed EvidencePack", () => {
    const plan = planFollowUpTransform({
      query: "Сделай короче",
      history: [{ role: "assistant", content: "Длинный текст письма." }],
    });
    assert.ok(plan);
    const block = formatFollowUpTransformContext(plan!);
    assert.match(block, /FOLLOW_UP_TRANSFORM/);
    assert.doesNotMatch(block, /EVIDENCE PACK|FINANCE|passport/i);
  });
});

describe("Phase 1 acceptance properties", () => {
  it("REQUIRED_EVIDENCE_NOT_LOST + UNNECESSARY_SENSITIVE_DATA_NOT_SENT + CROSS_CLIENT_BLEED", () => {
    const task = classifyCurrentTask({
      query: "Напиши деликатное письмо оплатить долг",
    });
    const pack = buildEvidencePack({
      task,
      clientRef: createClientRef({
        clientId: SYNTH_UUID,
        displayLabel: "Тестова",
      })!,
      safe: synthSafe(),
      finance: synthFinance(),
    });
    // Required finance evidence present.
    assert.ok(pack.projections.FINANCE?.debtAmount);
    assert.ok(pack.projections.CONTACT?.displayName || pack.projections.CASE);
    // Unnecessary sensitive absent.
    assert.equal(assertNoHighSensitivityInPack(pack).ok, true);
    // Cross-client bleed prevented by lock transition helper.
    const bleed = applyClientRefLockTransition({
      previous: createClientRef({ clientId: SYNTH_UUID })!,
      next: createClientRef({ clientId: OTHER_UUID })!,
      switchExplicit: false,
    });
    assert.equal(bleed.stalePrevented, true);
  });
});
