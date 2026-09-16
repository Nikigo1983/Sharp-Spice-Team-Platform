/**
 * General Astra routing — optional KB vs required internal KB,
 * dormant ClientRef lock, no false entity resolution.
 * Synthetic fixtures only; no OpenRouter / DB writes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClientRef } from "@/lib/ai/client-ref";
import { extractClientEntityFromQuery } from "@/lib/ai/client-entity-extract";
import {
  caseMemoryForModelIngress,
  clientRefFromCaseMemory,
  lockClientRefIntoCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  classifyCurrentTask,
  taskRequiresClientRef,
} from "@/lib/ai/current-task";
import {
  isMigratedClientModelPath,
  selectClientModelIngress,
} from "@/lib/ai/evidence-pack";
import {
  decideKbGrounding,
  KB_SAFE_GROUNDING_REPLY,
} from "@/lib/ai/kb-grounding";
import { detectWorkspaceIntent } from "@/lib/ai/query-intent";
import {
  isLockedClientDebtStatusQuery,
  isPronounDebtFollowUpQuery,
} from "@/lib/ai/finance-debt-query";
import {
  querySuggestsDifferentClient,
  resolveClient,
  shouldAttemptClientResolve,
} from "@/lib/ai/resolve-client";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";
import {
  isExplicitInternalKnowledgeQuery,
  isGeneralKnowledgeQuery,
} from "@/lib/ai/workspace-router-rules";
import { resolveWorkspaceRoutingSync } from "@/lib/ai/workspace-router";
import type { DriveRetrievalMeta } from "@/lib/ai/workspace-trace";
import type { WorkspaceCaseMemory } from "@/lib/ai/workspace-case-memory";

const BETA_UUID = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1";
const BETA_LABEL = "AI SYNTH BETA KAPLAN";
const APOSTILLE = "Объясни простыми словами, что такое апостиль.";
const EXPLICIT_KB =
  "Что в нашей базе знаний написано про AI_INTERNAL_NONEXISTENT_TOPIC?";
const DEBT_FOLLOWUP = "Какой у него долг?";

function betaRef() {
  return createClientRef({
    clientId: BETA_UUID,
    displayLabel: BETA_LABEL,
  })!;
}

function emptyKbMeta(): DriveRetrievalMeta {
  return {
    source: "knowledge_base",
    attempted: true,
    configured: true,
    mode: "full_export",
    groundingState: "KB_EMPTY",
    candidateFileCount: 0,
    selectedFiles: [],
    contentRetrieved: false,
    usefulContextEmpty: true,
    textCharCount: 0,
  };
}

function financeBeta(): PortalFinanceSnapshot {
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

function mockSearchMustNotRun(): never {
  throw new Error("portal_client_search_must_not_run_on_general_task");
}

describe("GENERAL_KNOWLEDGE_MODEL_ROUTE", () => {
  for (const query of [
    APOSTILLE,
    "Что такое апостиль?",
    "Объясни, что такое ВНЖ.",
    "Что означает легализация документа?",
    "Объясни простыми словами, что такое нотариальное заверение.",
  ]) {
    it(`routes optional KB for: ${query}`, () => {
      assert.equal(isGeneralKnowledgeQuery(query), true);
      const intent = detectWorkspaceIntent(query);
      const task = classifyCurrentTask({ query });
      assert.equal(task.taskClass, "GENERAL_GENERATION");
      assert.equal(taskRequiresClientRef(task), false);
      assert.deepEqual(task.requiredProjections, []);
      assert.equal(intent.needsKb, true);
      assert.equal(intent.kbRequired, false);
      assert.equal(intent.needsClients, false);
      const decision = resolveWorkspaceRoutingSync(query);
      assert.equal(decision.requiresAuthoritativeData, false);
      assert.ok(decision.sources.includes("knowledge_base"));
    });
  }
});

describe("GENERAL_KNOWLEDGE_KB_EMPTY_DOES_NOT_BLOCK", () => {
  it("Case A fresh + Case B locked: empty optional KB allows model", () => {
    const intent = detectWorkspaceIntent(APOSTILLE);
    const grounding = decideKbGrounding({
      intent,
      kbMeta: emptyKbMeta(),
    });
    assert.equal(grounding.blockModel, false);
    assert.equal(grounding.reason, "NONE");
    assert.equal(grounding.reply, null);
  });
});

describe("GENERAL_TASK_NO_CLIENT_RESOLUTION", () => {
  it("does not attempt resolveClient for apostille (fresh or locked)", async () => {
    const intent = detectWorkspaceIntent(APOSTILLE);
    const task = classifyCurrentTask({ query: APOSTILLE });
    for (const locked of [null, betaRef()]) {
      assert.equal(
        shouldAttemptClientResolve({
          followUp: false,
          isListLike: false,
          taskRequiresClientRef: taskRequiresClientRef(task),
          needsClients: intent.needsClients,
          fastClientLookup: intent.fastClientLookup,
          isDocFill: false,
          query: APOSTILLE,
        }),
        false,
      );
      const resolved = await resolveClient({
        query: APOSTILLE,
        lockedClientRef: locked,
        skipResolve: true,
        searchFn: async () => mockSearchMustNotRun(),
      });
      assert.equal(resolved.outcome, "NOT_REQUIRED");
    }
  });
});

describe("GENERAL_TASK_NO_FALSE_CLIENT_ENTITY", () => {
  it("entity noise must not become actionable resolve gate", () => {
    const entity = extractClientEntityFromQuery(APOSTILLE);
    // Extraction may still see «такое апостиль» from «что такое …» —
    // gating (not stopwords) must keep it non-actionable.
    assert.ok(entity === null || entity.searchPhrase.includes("апостиль"));
    const intent = detectWorkspaceIntent(APOSTILLE);
    const task = classifyCurrentTask({ query: APOSTILLE });
    assert.equal(
      shouldAttemptClientResolve({
        followUp: false,
        isListLike: false,
        taskRequiresClientRef: taskRequiresClientRef(task),
        needsClients: intent.needsClients,
        fastClientLookup: intent.fastClientLookup,
        isDocFill: false,
        query: APOSTILLE,
      }),
      false,
    );
    assert.equal(
      querySuggestsDifferentClient(APOSTILLE, betaRef()) &&
        shouldAttemptClientResolve({
          followUp: false,
          isListLike: false,
          taskRequiresClientRef: false,
          needsClients: false,
          fastClientLookup: false,
          isDocFill: false,
          query: APOSTILLE,
        }),
      false,
    );
  });
});

describe("GENERAL_TASK_NO_STALE_CLIENT_EVIDENCE", () => {
  it("locked BETA stays stored but dormant for model ingress", () => {
    const lockedMem: WorkspaceCaseMemory = lockClientRefIntoCaseMemory(null, betaRef());
    lockedMem.specialNotes = "BETA secret note";
    assert.equal(clientRefFromCaseMemory(lockedMem)?.clientId, BETA_UUID);

    const task = classifyCurrentTask({ query: APOSTILLE });
    const intent = detectWorkspaceIntent(APOSTILLE);
    const modelMem = caseMemoryForModelIngress({
      caseMemory: lockedMem,
      taskRequiresClientRef: taskRequiresClientRef(task),
      needsClients: intent.needsClients,
      fastClientLookup: intent.fastClientLookup,
    });
    assert.equal(modelMem, null);

    const migrated = isMigratedClientModelPath({
      hasClientRef: false,
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

describe("EXPLICIT_INTERNAL_KB_EMPTY_BLOCKS_MODEL", () => {
  it("required KB empty → safe reply, no model", () => {
    assert.equal(isExplicitInternalKnowledgeQuery(EXPLICIT_KB), true);
    const intent = detectWorkspaceIntent(EXPLICIT_KB);
    assert.equal(intent.needsKb, true);
    assert.equal(intent.kbRequired, true);
    const grounding = decideKbGrounding({
      intent,
      kbMeta: emptyKbMeta(),
    });
    assert.equal(grounding.blockModel, true);
    assert.equal(grounding.reason, "KB_EMPTY");
    assert.equal(grounding.reply, KB_SAFE_GROUNDING_REPLY);
  });
});

describe("CLIENT_LOCK_SURVIVES_GENERAL_TASK + POST_GENERAL_CLIENT_FOLLOWUP", () => {
  it("BETA lock → apostille dormant → debt follow-up reuses BETA finance", async () => {
    let memory = lockClientRefIntoCaseMemory(null, betaRef());
    assert.equal(clientRefFromCaseMemory(memory)?.clientId, BETA_UUID);

    // Turn 2: general apostille
    const generalTask = classifyCurrentTask({ query: APOSTILLE });
    const generalIntent = detectWorkspaceIntent(APOSTILLE);
    assert.equal(generalTask.taskClass, "GENERAL_GENERATION");
    assert.equal(taskRequiresClientRef(generalTask), false);
    assert.equal(generalIntent.kbRequired, false);
    assert.equal(
      decideKbGrounding({
        intent: generalIntent,
        kbMeta: emptyKbMeta(),
      }).blockModel,
      false,
    );
    assert.equal(
      shouldAttemptClientResolve({
        followUp: false,
        isListLike: false,
        taskRequiresClientRef: false,
        needsClients: generalIntent.needsClients,
        fastClientLookup: generalIntent.fastClientLookup,
        isDocFill: false,
        query: APOSTILLE,
      }),
      false,
    );
    assert.equal(
      caseMemoryForModelIngress({
        caseMemory: memory,
        taskRequiresClientRef: false,
        needsClients: false,
        fastClientLookup: false,
      }),
      null,
    );
    // Lock survives in store (dormant, not destroyed).
    assert.equal(clientRefFromCaseMemory(memory)?.clientId, BETA_UUID);

    // Turn 3: pronoun debt → reuse BETA, Finance 1000 EUR
    // (handled via lockedDebtStatusAsk path, not taskRequiresClientRef)
    assert.equal(isPronounDebtFollowUpQuery(DEBT_FOLLOWUP), true);
    assert.equal(isLockedClientDebtStatusQuery(DEBT_FOLLOWUP), true);
    const locked = clientRefFromCaseMemory(memory)!;
    assert.equal(querySuggestsDifferentClient(DEBT_FOLLOWUP, locked), false);
    const resolved = await resolveClient({
      query: DEBT_FOLLOWUP,
      lockedClientRef: locked,
      searchFn: async () => mockSearchMustNotRun(),
    });
    assert.equal(resolved.reusedLock, true);
    assert.equal(resolved.clientRef?.clientId, BETA_UUID);
    const finance = financeBeta();
    assert.equal(finance.clientId, resolved.clientRef!.clientId);
    assert.equal(finance.balanceCents, 100000);
    assert.match(finance.balance ?? "", /1\s*000/);
  });
});
