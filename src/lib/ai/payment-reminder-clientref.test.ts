/**
 * PAYMENT_REMINDER ClientRef reuse — UI/API-faithful regressions.
 * Synthetic fixtures only; no OpenRouter / DB writes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createClientRef,
  isQuestionnaireUuid,
} from "@/lib/ai/client-ref";
import {
  clientRefFromCaseMemory,
  lockClientRefIntoCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  classifyCurrentTask,
  isFollowUpTransformQuery,
  taskRequiresClientRef,
} from "@/lib/ai/current-task";
import {
  extractClientNameFromLetterQuery,
  formatDebtReminderLetter,
  isClientDebtReminderLetterQuery,
} from "@/lib/ai/client-debt-letter";
import { extractClientEntityFromQuery } from "@/lib/ai/client-entity-extract";
import {
  isLockedClientDebtStatusQuery,
  isPronounDebtFollowUpQuery,
} from "@/lib/ai/finance-debt-query";
import {
  extractExplicitDifferentClientPhrase,
  looksLikePersonName,
  querySuggestsDifferentClient,
  resolveClient,
} from "@/lib/ai/resolve-client";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";
import { mergeStreamCaseMemoryUpdate } from "@/lib/ai/workspace-case-memory";
import { planFollowUpTransform } from "@/lib/ai/follow-up-transform";

const ALPHA_UUID = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";
const BETA_UUID = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1";
const ALPHA_LABEL = "AI SYNTH ALPHA ZORIN";
const BETA_LABEL = "AI SYNTH BETA KAPLAN";

const TURN1 = `Найди всю информацию по клиенту ${ALPHA_LABEL}`;
const TURN2 = "Какой у него долг?";
const TURN3 =
  "Напиши вежливое сообщение клиенту с напоминанием об оплате долга";
const EXPLICIT_BETA_REMINDER =
  `Напиши напоминание об оплате для ${BETA_LABEL}`;
const EXPLICIT_SWITCH = `Переключись на клиента ${BETA_LABEL}`;
const TRANSFORM = "Сделай короче и теплее";

function financeAlpha(): PortalFinanceSnapshot {
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

function financeBeta(): PortalFinanceSnapshot {
  return {
    clientId: BETA_UUID,
    name: BETA_LABEL,
    email: "ai-synthetic-beta@example.com",
    contractAmount: "2 000 €",
    contractAmountCents: 200000,
    paidAmount: "1 000 €",
    paidAmountCents: 100000,
    balance: "1 000 €",
    balanceCents: 100000,
    paymentStatus: "partial",
    contractLabel: null,
    staffContractAmount: null,
  };
}

function mockSearchByLabel(query: string) {
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
  // Fail loudly if a weak noun like «напоминанием» is used as search.
  if (/напомина/i.test(query) && !/alpha|zorin|beta|kaplan|synth/i.test(query)) {
    throw new Error(`unexpected_portal_lookup_for_generic_noun:${query}`);
  }
  return { lookup: { kind: "not_found" as const }, debug: {} };
}

describe("PAYMENT_REMINDER_GENERIC_LANGUAGE_NOT_CLIENT_ENTITY", () => {
  it("does not treat instruction nouns after клиенту as person names", () => {
    const phrases = [
      "напиши клиенту сообщение",
      "напиши клиенту напоминание",
      "составь клиенту письмо",
      "напомни клиенту об оплате",
      TURN3,
    ];
    for (const q of phrases) {
      assert.equal(
        looksLikePersonName(
          extractClientEntityFromQuery(q)?.searchPhrase ?? "",
        ),
        false,
        q,
      );
      assert.equal(extractExplicitDifferentClientPhrase(q), null, q);
      assert.equal(extractClientNameFromLetterQuery(q), null, q);
    }
  });
});

describe("PAYMENT_REMINDER_LOCKED_CLIENTREF_REUSE", () => {
  it("three-turn UI/API shape reuses ALPHA lock for PAYMENT_REMINDER", async () => {
    const task1 = classifyCurrentTask({ query: TURN1 });
    assert.equal(task1.taskClass, "CLIENT_SUMMARY");
    assert.equal(taskRequiresClientRef(task1), true);

    const alphaRef = createClientRef({
      clientId: ALPHA_UUID,
      displayLabel: ALPHA_LABEL,
    })!;
    assert.equal(isQuestionnaireUuid(ALPHA_UUID), true);

    // TURN 1 → SSE lock → UI persist (faithful merge).
    const serverLock = lockClientRefIntoCaseMemory(null, alphaRef);
    let uiCaseMemory = mergeStreamCaseMemoryUpdate(undefined, serverLock, true);
    assert.equal(clientRefFromCaseMemory(uiCaseMemory)?.clientId, ALPHA_UUID);

    // TURN 2 pronoun debt.
    assert.equal(isPronounDebtFollowUpQuery(TURN2), true);
    assert.equal(isLockedClientDebtStatusQuery(TURN2), true);
    const lockedAfterT1 = clientRefFromCaseMemory(uiCaseMemory)!;
    assert.equal(querySuggestsDifferentClient(TURN2, lockedAfterT1), false);
    const turn2 = await resolveClient({
      query: TURN2,
      lockedClientRef: lockedAfterT1,
      searchFn: async () => {
        throw new Error("must_not_search_on_pronoun_debt");
      },
    });
    assert.equal(turn2.outcome, "RESOLVED_LOCKED");
    assert.equal(turn2.reusedLock, true);
    assert.equal(turn2.clientRef?.clientId, ALPHA_UUID);
    uiCaseMemory = mergeStreamCaseMemoryUpdate(
      uiCaseMemory,
      lockClientRefIntoCaseMemory(uiCaseMemory, turn2.clientRef!),
      true,
    );

    // TURN 3 PAYMENT_REMINDER — request still carries ClientRef.
    const task3 = classifyCurrentTask({ query: TURN3 });
    assert.equal(task3.taskClass, "PAYMENT_REMINDER");
    assert.equal(isClientDebtReminderLetterQuery(TURN3), true);
    assert.equal(taskRequiresClientRef(task3), true);
    const lockedForT3 = clientRefFromCaseMemory(uiCaseMemory);
    assert.ok(lockedForT3, "TURN3_REQUEST_CLIENTREF_PRESENT");
    assert.equal(lockedForT3!.clientId, ALPHA_UUID);
    assert.equal(querySuggestsDifferentClient(TURN3, lockedForT3), false);

    let searched = false;
    const turn3 = await resolveClient({
      query: TURN3,
      lockedClientRef: lockedForT3,
      searchFn: async (q) => {
        searched = true;
        return mockSearchByLabel(q);
      },
    });
    assert.equal(searched, false, "no portal lookup for generic nouns");
    assert.equal(turn3.outcome, "RESOLVED_LOCKED");
    assert.equal(turn3.reusedLock, true, "TURN3_LOCKED_CLIENTREF_REUSED");
    assert.equal(turn3.clientRef?.clientId, ALPHA_UUID, "TURN3_RESOLVED_UUID");

    const finance = financeAlpha();
    assert.equal(finance.clientId, turn3.clientRef!.clientId);
    assert.equal(finance.balanceCents, 125000);
    const draft = formatDebtReminderLetter({
      displayName: ALPHA_LABEL,
      email: finance.email,
      contractAmount: finance.contractAmount,
      contractAmountCents: finance.contractAmountCents,
      paidAmount: finance.paidAmount,
      balance: finance.balance,
      balanceCents: finance.balanceCents,
      mentionResidencePermit: false,
    });
    assert.match(draft, /1\s*250|1250/);
  });
});

describe("PAYMENT_REMINDER_FINANCE_BY_CANONICAL_UUID", () => {
  it("binds Finance snapshot by questionnaire UUID not display name", () => {
    const snap = financeAlpha();
    assert.equal(snap.clientId, ALPHA_UUID);
    assert.equal(isQuestionnaireUuid(snap.clientId), true);
    assert.equal(snap.contractAmountCents, 200000);
    assert.equal(snap.paidAmountCents, 75000);
    assert.equal(snap.balanceCents, 125000);
  });
});

describe("PAYMENT_REMINDER_EXPLICIT_DIFFERENT_CLIENT", () => {
  it("explicit BETA reminder does not silently reuse ALPHA lock", async () => {
    const alphaRef = createClientRef({
      clientId: ALPHA_UUID,
      displayLabel: ALPHA_LABEL,
    })!;
    assert.equal(querySuggestsDifferentClient(EXPLICIT_BETA_REMINDER, alphaRef), true);
    assert.ok(extractExplicitDifferentClientPhrase(EXPLICIT_BETA_REMINDER));

    const resolved = await resolveClient({
      query: EXPLICIT_BETA_REMINDER,
      lockedClientRef: alphaRef,
      searchFn: async (q) => mockSearchByLabel(q),
    });
    assert.equal(resolved.outcome, "RESOLVED");
    assert.equal(resolved.reusedLock, false);
    assert.equal(resolved.clientRef?.clientId, BETA_UUID);
    const betaFinance = financeBeta();
    assert.equal(betaFinance.clientId, BETA_UUID);
    assert.equal(betaFinance.balanceCents, 100000);
    const draft = formatDebtReminderLetter({
      displayName: BETA_LABEL,
      email: betaFinance.email,
      contractAmount: betaFinance.contractAmount,
      contractAmountCents: betaFinance.contractAmountCents,
      paidAmount: betaFinance.paidAmount,
      balance: betaFinance.balance,
      balanceCents: betaFinance.balanceCents,
    });
    assert.match(draft, /1\s*000|1000/);
    assert.doesNotMatch(draft, /1\s*250|1250/);
  });

  it("explicit switch replaces ALPHA lock with BETA", async () => {
    const alphaRef = createClientRef({
      clientId: ALPHA_UUID,
      displayLabel: ALPHA_LABEL,
    })!;
    assert.equal(querySuggestsDifferentClient(EXPLICIT_SWITCH, alphaRef), true);
    const resolved = await resolveClient({
      query: EXPLICIT_SWITCH,
      lockedClientRef: alphaRef,
      searchFn: async (q) => mockSearchByLabel(q),
    });
    assert.equal(resolved.outcome, "RESOLVED");
    assert.equal(resolved.clientRef?.clientId, BETA_UUID);
    const memory = lockClientRefIntoCaseMemory(null, resolved.clientRef!);
    assert.equal(clientRefFromCaseMemory(memory)?.clientId, BETA_UUID);
  });
});

describe("REMINDER_FOLLOW_UP_TRANSFORM_NO_REFETCH", () => {
  it("transform after reminder draft does not re-resolve or refetch", async () => {
    const alphaRef = createClientRef({
      clientId: ALPHA_UUID,
      displayLabel: ALPHA_LABEL,
    })!;
    const draft = formatDebtReminderLetter({
      displayName: ALPHA_LABEL,
      email: "ai-synthetic-alpha@example.com",
      contractAmount: "2 000 €",
      contractAmountCents: 200000,
      paidAmount: "750 €",
      balance: "1 250 €",
      balanceCents: 125000,
    });
    assert.equal(isFollowUpTransformQuery(TRANSFORM), true);
    const plan = planFollowUpTransform({
      query: TRANSFORM,
      history: [{ role: "assistant", content: draft }],
    });
    assert.ok(plan);
    const task = classifyCurrentTask({
      query: TRANSFORM,
      hasPriorDraft: true,
    });
    assert.equal(task.taskClass, "FOLLOW_UP_TRANSFORM");
    assert.equal(taskRequiresClientRef(task), false);

    const resolved = await resolveClient({
      query: TRANSFORM,
      lockedClientRef: alphaRef,
      skipResolve: true,
      searchFn: async () => {
        throw new Error("transform_must_not_search");
      },
    });
    assert.equal(resolved.outcome, "NOT_REQUIRED");
    assert.equal(resolved.reusedLock, true);
    assert.equal(querySuggestsDifferentClient(TRANSFORM, alphaRef), false);
  });
});
