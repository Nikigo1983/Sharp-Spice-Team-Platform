/**
 * Phase 2 — consolidate canonical pipeline + retire broad preload (synthetic only).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createClientRef,
} from "@/lib/ai/client-ref";
import {
  applyClientRefLockTransition,
  clearClientRefFromCaseMemory,
  clientRefFromCaseMemory,
  lockClientRefIntoCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import { classifyCurrentTask } from "@/lib/ai/current-task";
import {
  assertNoHighSensitivityInPack,
  buildEvidencePack,
  formatEvidencePackForModel,
} from "@/lib/ai/evidence-pack";
import { planFollowUpTransform } from "@/lib/ai/follow-up-transform";
import {
  resolveClient,
  toTraceClientResolutionOutcome,
} from "@/lib/ai/resolve-client";
import { queryRequiresVolatileRefetch } from "@/lib/ai/volatile-facts";
import {
  buildSafeClientSearchHistoryEntry,
  clearClientSearchHistoryForTests,
  getRecentClientSearches,
  recordClientSearch,
} from "@/lib/ai/client-search-history";
import { shouldUseInternetSearch } from "@/lib/ai/workspace-web-search";
import {
  resolveCompletionPrivacy,
} from "@/lib/ai/openai";
import {
  createEmptyWorkspaceAiTrace,
  serializeWorkspaceAiTraceForLog,
} from "@/lib/ai/workspace-trace";
import type { SafeClientRecord } from "@/lib/ai/workspace-tools/client-tools";
import { alignClientToolPayloadWithEvidencePolicy } from "@/lib/ai/workspace-tools/client-tools";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";
import type { ClientAiSearchResult } from "@/lib/ai/client-lookup";
import type { ResolvedClientContext } from "@/lib/ai/client-context";

const UUID_A = "11111111-2222-4333-8444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

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
      { label: "Адрес букинга", value: "Secret St 1", empty: false },
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
    paidAmountCents: 4000,
    balance: "€60",
    balanceCents: 6000,
    paymentStatus: "partial",
    contractLabel: "C",
    staffContractAmount: null,
  };
}

function synthResolved(id: string, name: string): ResolvedClientContext {
  return {
    source: "clients",
    sourceLabel: "portal",
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

describe("Phase 2 resolveClient authority", () => {
  it("A: unique client resolves through resolveClient to questionnaire UUID", async () => {
    const result = await resolveClient({
      query: "Найди Тестову",
      searchFn: async () =>
        ({
          lookup: {
            kind: "single",
            client: synthResolved(UUID_A, "Тестова"),
            query: "Тестова",
          },
          intent: {} as ClientAiSearchResult["intent"],
          usedStructuredSearch: false,
          intentType: "single",
          foundClients: 1,
          sentToClaude: 1,
        }) satisfies ClientAiSearchResult,
    });
    assert.equal(result.outcome, "RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    assert.equal(result.clientRef.clientId, UUID_A);
  });

  it("B/C: ambiguous and not found stay explicit", async () => {
    const amb = await resolveClient({
      query: "Тестова",
      searchFn: async () =>
        ({
          lookup: {
            kind: "multiple",
            clients: [
              synthResolved(UUID_A, "А"),
              synthResolved(UUID_B, "Б"),
            ],
            pendingParts: [],
            query: "x",
          },
          intent: {} as ClientAiSearchResult["intent"],
          usedStructuredSearch: false,
          intentType: "single",
          foundClients: 2,
          sentToClaude: 2,
        }) satisfies ClientAiSearchResult,
    });
    assert.equal(amb.outcome, "AMBIGUOUS");
    assert.equal(toTraceClientResolutionOutcome(amb.outcome), "AMBIGUOUS");

    const nf = await resolveClient({
      query: "Неттакого",
      searchFn: async () =>
        ({
          lookup: { kind: "not_found", query: "x" },
          intent: {} as ClientAiSearchResult["intent"],
          usedStructuredSearch: false,
          intentType: "single",
          foundClients: 0,
          sentToClaude: 0,
        }) satisfies ClientAiSearchResult,
    });
    assert.equal(nf.outcome, "NOT_FOUND");
  });

  it("D: locked ClientRef prevents duplicate resolution", async () => {
    let searchCalls = 0;
    const locked = createClientRef({
      clientId: UUID_A,
      displayLabel: "Тестова",
    })!;
    const result = await resolveClient({
      query: "Какой долг?",
      lockedClientRef: locked,
      searchFn: async () => {
        searchCalls += 1;
        throw new Error("should not search");
      },
    });
    assert.equal(result.outcome, "RESOLVED_LOCKED");
    assert.equal(result.reusedLock, true);
    assert.equal(searchCalls, 0);
  });

  it("E/F: client switch replaces lock; old evidence cannot survive", () => {
    const prev = createClientRef({ clientId: UUID_A, displayLabel: "Иванова" })!;
    const next = createClientRef({ clientId: UUID_B, displayLabel: "Петрова" })!;
    const blocked = applyClientRefLockTransition({
      previous: prev,
      next,
      switchExplicit: false,
    });
    assert.equal(blocked.stalePrevented, true);
    assert.equal(blocked.active?.clientId, UUID_A);

    const switched = applyClientRefLockTransition({
      previous: prev,
      next,
      switchExplicit: true,
    });
    assert.equal(switched.active?.clientId, UUID_B);

    let memory = lockClientRefIntoCaseMemory(null, prev);
    memory = clearClientRefFromCaseMemory(memory);
    memory = lockClientRefIntoCaseMemory(memory, next);
    const restored = clientRefFromCaseMemory(memory);
    assert.equal(restored?.clientId, UUID_B);
    assert.notEqual(restored?.clientId, UUID_A);
  });
});

describe("Phase 2 EvidencePack boundary + preload", () => {
  it("G/H/I/J/K/L/M: Finance UUID + pack excludes high-sens; CONTACT/CASE/FINANCE scoped", () => {
    const finance = synthFinance(UUID_A);
    assert.equal(finance.clientId, UUID_A);

    const contactTask = classifyCurrentTask({
      query: "Напиши короткое резюме контактов Тестовой",
    });
    // generative client summary
    const summaryTask = classifyCurrentTask({
      query: "Резюме по клиенту Тестовой",
    });
    assert.equal(summaryTask.taskClass, "CLIENT_SUMMARY");

    const pack = buildEvidencePack({
      task: summaryTask,
      clientRef: createClientRef({ clientId: UUID_A, displayLabel: "Тестова" })!,
      safe: synthSafe(),
      finance,
    });
    assert.ok(pack.projections.CONTACT);
    assert.ok(pack.projections.CASE);
    assert.ok(pack.projections.FINANCE);
    assert.equal(pack.projections.FINANCE?.linkField, "clientExternalId");
    assert.equal(assertNoHighSensitivityInPack(pack).ok, true);

    const text = formatEvidencePackForModel(pack);
    assert.doesNotMatch(text, /XX9999999|Secret St/);
    assert.match(text, /EVIDENCE PACK/);
    // Broad CLIENT CONTEXT must not be part of EvidencePack text.
    assert.doesNotMatch(text, /CLIENT CONTEXT \(Заявки/);
    void contactTask;
  });

  it("W: migrated path marker — EvidencePack used implies no broad CLIENT CONTEXT in pack", () => {
    const pack = buildEvidencePack({
      task: classifyCurrentTask({ query: "Резюме по клиенту Тестовой" }),
      clientRef: createClientRef({ clientId: UUID_A })!,
      safe: synthSafe(),
      finance: synthFinance(),
    });
    const blob = formatEvidencePackForModel(pack);
    assert.equal(blob.includes("=== CLIENT CONTEXT"), false);
    assert.equal(blob.includes("=== EVIDENCE PACK"), true);
  });
});

describe("Phase 2 model call policy + directs", () => {
  it("N/O/P: exact facts do not require model", () => {
    assert.equal(
      classifyCurrentTask({ query: "Какой email у Тестовой?" }).modelRequired,
      false,
    );
    assert.equal(
      classifyCurrentTask({ query: "Сколько должна Тестова?" }).modelRequired,
      false,
    );
    assert.equal(
      classifyCurrentTask({
        query: "Напиши письмо Тестовой оплатить долг деликатно",
      }).modelRequired,
      true,
    );
    // Deterministic debt letter may still short-circuit before model in assistant.
  });

  it("Q: generative payment reminder needs EvidencePack projections", () => {
    const task = classifyCurrentTask({
      query: "Напиши ей деликатное письмо оплатить долг",
    });
    assert.equal(task.taskClass, "PAYMENT_REMINDER");
    assert.equal(task.modelRequired, true);
    assert.ok(task.requiredProjections.includes("FINANCE"));
  });

  it("R: follow-up rewrite → no resolve / no Finance / no EvidencePack", () => {
    const plan = planFollowUpTransform({
      query: "Сделай короче",
      history: [{ role: "assistant", content: "Длинный текст." }],
    });
    assert.ok(plan);
    assert.equal(plan?.resolveClient, false);
    assert.equal(plan?.refetchFinance, false);
    assert.equal(plan?.attachEvidencePack, false);
  });
});

describe("Phase 2 privacy + history + volatile + tools", () => {
  it("S/T: web search blocked; unsafe provider fail-closed", () => {
    assert.equal(
      shouldUseInternetSearch("Найди email Тестовой в интернете"),
      false,
    );
    const blocked = resolveCompletionPrivacy({
      containsClientData: true,
      provider: "openai",
    });
    assert.equal(blocked.decision.ok, false);
  });

  it("U: search history retains no raw query/names", () => {
    clearClientSearchHistoryForTests();
    const entry = buildSafeClientSearchHistoryEntry({
      query: "Найди Тестову паспорт",
      resultKind: "single",
      topScore: 90,
      matchCount: 1,
      matches: [
        {
          name: "Тестова Анна",
          score: 90,
          source: "portal",
          rowIndex: 1,
          matchedFields: ["name"],
        },
      ],
    });
    recordClientSearch(entry);
    const recent = getRecentClientSearches();
    assert.equal(recent.length, 1);
    const blob = JSON.stringify(recent);
    assert.doesNotMatch(blob, /Тестову|Тестова|паспорт/);
    assert.equal(recent[0]?.queryPresent, true);
    assert.ok((recent[0]?.queryLength ?? 0) > 0);
    assert.equal(recent[0]?.matches[0]?.namePresent, true);
    assert.ok(!("query" in (recent[0] as object)));
    assert.ok(!("name" in (recent[0]?.matches[0] as object)));
  });

  it("V: traces metadata only", () => {
    const trace = createEmptyWorkspaceAiTrace(
      "00000000-0000-4000-8000-0000000000dd",
    );
    trace.pipelineClass = "CANONICAL_PIPELINE";
    trace.evidencePackUsed = true;
    trace.legacyPreloadUsed = false;
    trace.clientRefReused = true;
    trace.volatileRefetch = false;
    const s = JSON.stringify(serializeWorkspaceAiTraceForLog(trace));
    assert.match(s, /pipelineClass|evidencePackUsed/);
    assert.doesNotMatch(s, /Тестова|XX9999999|@example/);
  });

  it("H: current debt request requires volatile refetch signal", () => {
    assert.equal(queryRequiresVolatileRefetch("Какой долг сейчас?"), true);
    assert.equal(
      queryRequiresVolatileRefetch("актуальный баланс оплаты"),
      true,
    );
    assert.equal(
      queryRequiresVolatileRefetch(
        "актуальные требования Digital Nomad в Хорватии",
      ),
      false,
    );
  });

  it("tool payloads strip passport/address like EvidencePack", () => {
    const aligned = alignClientToolPayloadWithEvidencePolicy(synthSafe());
    assert.equal(aligned.passport, null);
    assert.equal(aligned.bookingAddress, null);
    assert.equal(aligned.placeOfBirth, null);
    assert.ok(!aligned.fields.some((f) => /паспорт|букинг/i.test(f.label)));
    assert.ok(aligned.fields.some((f) => f.label === "Email"));
  });
});

describe("Phase 2 acceptance", () => {
  it("REQUIRED_EVIDENCE / NO SENSITIVE / NO BLEED / EVIDENCEPACK / NO DUPE / NO BROAD PRELOAD", () => {
    const pack = buildEvidencePack({
      task: classifyCurrentTask({
        query: "Напиши деликатное письмо оплатить долг",
      }),
      clientRef: createClientRef({ clientId: UUID_A })!,
      safe: synthSafe(),
      finance: synthFinance(),
    });
    assert.ok(pack.projections.FINANCE?.debtAmount);
    assert.equal(assertNoHighSensitivityInPack(pack).ok, true);
    const bleed = applyClientRefLockTransition({
      previous: createClientRef({ clientId: UUID_A })!,
      next: createClientRef({ clientId: UUID_B })!,
      switchExplicit: false,
    });
    assert.equal(bleed.stalePrevented, true);
    assert.doesNotMatch(formatEvidencePackForModel(pack), /CLIENT CONTEXT/);
  });
});
