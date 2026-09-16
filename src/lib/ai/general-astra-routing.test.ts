/**
 * General grounding mode — prompt contract + conversation regressions.
 * Synthetic fixtures only; no OpenRouter / DB writes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTHORITATIVE_EVIDENCE_BANNER,
  AUTHORITATIVE_GROUNDING_SYSTEM_RULES,
  GENERAL_KNOWLEDGE_GROUNDING_SYSTEM_RULES,
  hasUsefulAuthoritativeEvidence,
  resolveWorkspaceGroundingMode,
  userGroundingEnvelopeNote,
} from "@/lib/ai/answer-grounding";
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
  isLockedClientDebtStatusQuery,
  isPronounDebtFollowUpQuery,
} from "@/lib/ai/finance-debt-query";
import {
  filterSurveyDataForModelContext,
} from "@/lib/ai/high-sensitivity-gate";
import {
  decideKbGrounding,
  KB_SAFE_GROUNDING_REPLY,
} from "@/lib/ai/kb-grounding";
import { detectWorkspaceIntent } from "@/lib/ai/query-intent";
import {
  querySuggestsDifferentClient,
  resolveClient,
  shouldAttemptClientResolve,
} from "@/lib/ai/resolve-client";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";
import { buildWorkspaceChatMessagesForTest } from "@/lib/ai/workspace-assistant";
import {
  assertGeneralKnowledgePromptContract,
  buildWorkspaceSystemPrompt,
} from "@/lib/ai/workspace-prompt";
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
const EXPLICIT_KB_WITH_TOPIC =
  "Что в нашей базе знаний написано про digital nomad?";
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

describe("GENERAL_GROUNDING_MODE_PROPAGATED", () => {
  it("resolves GENERAL_KNOWLEDGE_ALLOWED for optional KB generation", () => {
    const intent = detectWorkspaceIntent(APOSTILLE);
    const task = classifyCurrentTask({ query: APOSTILLE });
    const mode = resolveWorkspaceGroundingMode({
      kbRequired: intent.kbRequired,
      taskRequiresClientRef: taskRequiresClientRef(task),
      needsClients: intent.needsClients,
      fastClientLookup: intent.fastClientLookup,
    });
    assert.equal(mode, "GENERAL_KNOWLEDGE_ALLOWED");
    assert.equal(intent.kbRequired, false);
  });

  it("resolves AUTHORITATIVE_GROUNDED for required KB and client tasks", () => {
    assert.equal(
      resolveWorkspaceGroundingMode({
        kbRequired: true,
        taskRequiresClientRef: false,
        needsClients: false,
        fastClientLookup: false,
      }),
      "AUTHORITATIVE_GROUNDED",
    );
    assert.equal(
      resolveWorkspaceGroundingMode({
        kbRequired: false,
        taskRequiresClientRef: true,
        needsClients: false,
        fastClientLookup: false,
      }),
      "AUTHORITATIVE_GROUNDED",
    );
  });
});

describe("GENERAL_PROMPT_ALLOWS_MODEL_KNOWLEDGE + NO_SOURCE_ONLY_CONTRADICTION", () => {
  it("GENERAL_KNOWLEDGE_ALLOWED system prompt permits general knowledge only", () => {
    const prompt = buildWorkspaceSystemPrompt(
      "brief",
      "GENERAL_KNOWLEDGE_ALLOWED",
    );
    const contract = assertGeneralKnowledgePromptContract(prompt);
    assert.equal(contract.allowsGeneralKnowledge, true);
    assert.equal(contract.hasSourceOnlyContradiction, false);
    assert.match(prompt, /GENERAL_KNOWLEDGE_ALLOWED/);
    assert.doesNotMatch(prompt, /AUTHORITATIVE_GROUNDED/);
    assert.ok(prompt.includes(GENERAL_KNOWLEDGE_GROUNDING_SYSTEM_RULES.slice(0, 40)));
    assert.equal(prompt.includes("не отвечай «из общих знаний»"), false);
    assert.equal(
      prompt.includes("опираться только на данные платформы и базу знаний"),
      false,
    );
  });

  it("AUTHORITATIVE system prompt keeps source-only rules", () => {
    const prompt = buildWorkspaceSystemPrompt("brief", "AUTHORITATIVE_GROUNDED");
    assert.match(prompt, /AUTHORITATIVE_GROUNDED/);
    assert.match(prompt, /не отвечай «из общих знаний»/);
    assert.match(prompt, /опираться только на данные платформы и базу знаний/);
    assert.ok(prompt.includes(AUTHORITATIVE_GROUNDING_SYSTEM_RULES.slice(0, 40)));
  });
});

describe("OPTIONAL_EMPTY_KB_NOT_AUTHORITATIVE", () => {
  it("empty KB header/notice is not useful authoritative evidence", () => {
    const emptyBlock =
      "=== KNOWLEDGE BASE ===\nKnowledge Base: релевантных документов по запросу не найдено.";
    assert.equal(hasUsefulAuthoritativeEvidence(emptyBlock), false);
    assert.equal(hasUsefulAuthoritativeEvidence("=== KNOWLEDGE BASE ===\n"), false);
    const note = userGroundingEnvelopeNote({
      groundingMode: "GENERAL_KNOWLEDGE_ALLOWED",
      hasUsefulAuthoritativeEvidence: false,
    });
    assert.doesNotMatch(note, /AUTHORITATIVE_PLATFORM_EVIDENCE/);
    assert.equal(note.includes(AUTHORITATIVE_EVIDENCE_BANNER), false);

    const messages = buildWorkspaceChatMessagesForTest(
      APOSTILLE,
      "",
      [],
      "brief",
      null,
      null,
      "GENERAL_KNOWLEDGE_ALLOWED",
    );
    const joined = messages.map((m) => m.content).join("\n");
    assert.doesNotMatch(joined, /AUTHORITATIVE_PLATFORM_EVIDENCE/);
    assert.match(joined, /GENERAL_KNOWLEDGE_ALLOWED/);
    assert.doesNotMatch(joined, /не отвечай «из общих знаний»/);
  });
});

describe("OPTIONAL_KB_WITH_CONTENT_GENERAL_ALLOWED", () => {
  it("optional KB content keeps general mode; does not force source-only ban", () => {
    const kbWithContent = [
      "=== KNOWLEDGE BASE ===",
      "[SOURCE:KB:1]",
      "Title: Apostille.md",
      "content_retrieved: yes",
      "<<<UNTRUSTED_SOURCE_DATA kind=\"kb\" ref=\"KB:1\">>>",
      "Apostille is a certification...",
      "<<<END_UNTRUSTED_SOURCE_DATA>>>",
    ].join("\n");
    assert.equal(hasUsefulAuthoritativeEvidence(kbWithContent), true);
    const mode = resolveWorkspaceGroundingMode({
      kbRequired: false,
      taskRequiresClientRef: false,
      needsClients: false,
      fastClientLookup: false,
    });
    assert.equal(mode, "GENERAL_KNOWLEDGE_ALLOWED");
    const messages = buildWorkspaceChatMessagesForTest(
      APOSTILLE,
      kbWithContent,
      [],
      "brief",
      null,
      null,
      mode,
    );
    const joined = messages.map((m) => m.content).join("\n");
    assert.match(joined, /GENERAL_KNOWLEDGE_ALLOWED/);
    assert.doesNotMatch(joined, /не отвечай «из общих знаний»/);
    assert.doesNotMatch(joined, /AUTHORITATIVE_PLATFORM_EVIDENCE/);
    assert.match(joined, /\[SOURCE:KB:1\]/);
  });
});

describe("REQUIRED_KB_EMPTY_BLOCKS_MODEL", () => {
  it("explicit internal KB empty blocks model", () => {
    assert.equal(isExplicitInternalKnowledgeQuery(EXPLICIT_KB), true);
    const intent = detectWorkspaceIntent(EXPLICIT_KB);
    assert.equal(intent.kbRequired, true);
    const grounding = decideKbGrounding({
      intent,
      kbMeta: emptyKbMeta(),
    });
    assert.equal(grounding.blockModel, true);
    assert.equal(grounding.reply, KB_SAFE_GROUNDING_REPLY);
  });
});

describe("REQUIRED_KB_WITH_CONTENT_SOURCE_GROUNDED", () => {
  it("explicit KB request uses authoritative prompt policy", () => {
    const intent = detectWorkspaceIntent(EXPLICIT_KB_WITH_TOPIC);
    assert.equal(intent.kbRequired, true);
    const mode = resolveWorkspaceGroundingMode({
      kbRequired: intent.kbRequired,
      taskRequiresClientRef: false,
      needsClients: false,
      fastClientLookup: false,
    });
    assert.equal(mode, "AUTHORITATIVE_GROUNDED");
    const prompt = buildWorkspaceSystemPrompt("brief", mode);
    assert.match(prompt, /не отвечай «из общих знаний»/);
    assert.match(prompt, /AUTHORITATIVE_GROUNDED/);
  });
});

describe("CLIENT_FINANCE_REMAINS_AUTHORITATIVE", () => {
  it("pronoun debt stays on locked BETA finance path", async () => {
    const memory = lockClientRefIntoCaseMemory(null, betaRef());
    assert.equal(isPronounDebtFollowUpQuery(DEBT_FOLLOWUP), true);
    assert.equal(isLockedClientDebtStatusQuery(DEBT_FOLLOWUP), true);
    const locked = clientRefFromCaseMemory(memory)!;
    const resolved = await resolveClient({
      query: DEBT_FOLLOWUP,
      lockedClientRef: locked,
      searchFn: async () => mockSearchMustNotRun(),
    });
    assert.equal(resolved.reusedLock, true);
    assert.equal(resolved.clientRef?.clientId, BETA_UUID);
    assert.equal(financeBeta().balanceCents, 100000);
    assert.equal(
      resolveWorkspaceGroundingMode({
        kbRequired: false,
        taskRequiresClientRef: true,
        needsClients: false,
        fastClientLookup: false,
      }),
      "AUTHORITATIVE_GROUNDED",
    );
  });
});

describe("GENERAL_TASK_NO_STALE_CLIENT_EVIDENCE", () => {
  it("apostille with BETA lock: dormant evidence, general prompt", () => {
    const lockedMem = lockClientRefIntoCaseMemory(null, betaRef());
    lockedMem.specialNotes = "BETA secret note";
    const task = classifyCurrentTask({ query: APOSTILLE });
    const intent = detectWorkspaceIntent(APOSTILLE);
    assert.equal(task.taskClass, "GENERAL_GENERATION");
    assert.equal(taskRequiresClientRef(task), false);
    assert.equal(
      caseMemoryForModelIngress({
        caseMemory: lockedMem,
        taskRequiresClientRef: false,
        needsClients: intent.needsClients,
        fastClientLookup: intent.fastClientLookup,
      }),
      null,
    );
    assert.equal(
      isMigratedClientModelPath({
        hasClientRef: false,
        modelRequired: task.modelRequired,
        requiredProjectionCount: 0,
      }),
      false,
    );
    const ingress = selectClientModelIngress({
      migratedClientModelPath: false,
      evidencePackText: null,
    });
    assert.equal(ingress.evidencePackText, null);
    assert.equal(ingress.broadClientFallbackToModel, false);

    const messages = buildWorkspaceChatMessagesForTest(
      APOSTILLE,
      "",
      [],
      "brief",
      null,
      null,
      "GENERAL_KNOWLEDGE_ALLOWED",
    );
    const joined = messages.map((m) => m.content).join("\n");
    assert.doesNotMatch(joined, /BETA secret|b1b1b1b1-b1b1|=== EVIDENCE PACK ===|debtAmount/i);
    assert.doesNotMatch(joined, /AI SYNTH BETA KAPLAN/);
  });
});

describe("CLIENT_LOCK_SURVIVES_GENERAL_TASK + POST_GENERAL_CLIENT_FOLLOWUP", () => {
  it("BETA lock → apostille general prompt → debt reuses BETA", async () => {
    let memory = lockClientRefIntoCaseMemory(null, betaRef());
    const generalIntent = detectWorkspaceIntent(APOSTILLE);
    const generalTask = classifyCurrentTask({ query: APOSTILLE });
    assert.equal(isGeneralKnowledgeQuery(APOSTILLE), true);
    assert.equal(generalTask.taskClass, "GENERAL_GENERATION");
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
        needsClients: false,
        fastClientLookup: false,
        isDocFill: false,
        query: APOSTILLE,
      }),
      false,
    );
    const mode = resolveWorkspaceGroundingMode({
      kbRequired: false,
      taskRequiresClientRef: false,
      needsClients: false,
      fastClientLookup: false,
    });
    assert.equal(mode, "GENERAL_KNOWLEDGE_ALLOWED");
    const messages = buildWorkspaceChatMessagesForTest(
      APOSTILLE,
      "",
      [],
      "brief",
      null,
      null,
      mode,
    );
    const joined = messages.map((m) => m.content).join("\n");
    assert.match(joined, /GENERAL_KNOWLEDGE_ALLOWED/);
    assert.doesNotMatch(joined, /AUTHORITATIVE_PLATFORM_EVIDENCE/);
    assert.doesNotMatch(joined, /не отвечай «из общих знаний»/);
    assert.equal(clientRefFromCaseMemory(memory)?.clientId, BETA_UUID);

    const locked = clientRefFromCaseMemory(memory)!;
    assert.equal(querySuggestsDifferentClient(DEBT_FOLLOWUP, locked), false);
    const resolved = await resolveClient({
      query: DEBT_FOLLOWUP,
      lockedClientRef: locked,
      searchFn: async () => mockSearchMustNotRun(),
    });
    assert.equal(resolved.clientRef?.clientId, BETA_UUID);
    assert.equal(financeBeta().balanceCents, 100000);
  });
});

describe("SENSITIVE_EMPTY_FIELD_LABELS_REMOVED", () => {
  it("omits empty passport/attachment labels from survey model ingress", () => {
    const survey = [
      "ПОЛЯ ЗАЯВКИ ПОРТАЛА:",
      "- ФИО (кириллицей): AI SYNTH BETA KAPLAN",
      "- Номер загранпаспорта: [не заполнено]",
      "- Дата рождения: [не заполнено]",
      "- Адрес проживания (страна гражданства): [не заполнено]",
      "- Загранпаспорт (PDF): [не заполнено]",
      "- Справка о несудимости: [не заполнено]",
      "- Электронная почта: ai-synthetic-beta@example.com",
    ].join("\n");
    const gated = filterSurveyDataForModelContext(survey);
    assert.match(gated, /ФИО \(кириллицей\)/);
    assert.match(gated, /Электронная почта/);
    assert.doesNotMatch(gated, /Номер загранпаспорта/);
    assert.doesNotMatch(gated, /Дата рождения/);
    assert.doesNotMatch(gated, /Адрес проживания/);
    assert.doesNotMatch(gated, /Загранпаспорт \(PDF\)/);
    assert.doesNotMatch(gated, /Справка о несудимости/);
  });
});

describe("GENERAL_KNOWLEDGE_MODEL_ROUTE smoke", () => {
  for (const query of [
    APOSTILLE,
    "Что такое апостиль?",
    "Объясни, что такое ВНЖ.",
    "Что означает легализация документа?",
  ]) {
    it(`optional route: ${query}`, () => {
      const intent = detectWorkspaceIntent(query);
      const task = classifyCurrentTask({ query });
      const decision = resolveWorkspaceRoutingSync(query);
      assert.equal(task.taskClass, "GENERAL_GENERATION");
      assert.equal(intent.kbRequired, false);
      assert.equal(decision.requiresAuthoritativeData, false);
      assert.equal(
        extractClientEntityFromQuery(query) === null ||
          !shouldAttemptClientResolve({
            followUp: false,
            isListLike: false,
            taskRequiresClientRef: false,
            needsClients: false,
            fastClientLookup: false,
            isDocFill: false,
            query,
          }),
        true,
      );
    });
  }
});
