/**
 * Security Gate 1 — privacy boundary regression matrix (synthetic only).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyHighSensitivityGateToRecord,
  createHighSensitivityAllow,
  filterFieldRowsForModelContext,
} from "@/lib/ai/high-sensitivity-gate";
import { queryLooksLikeClientPii } from "@/lib/ai/client-pii-signals";
import {
  aiErrorMessage,
  classifyAiFailure,
} from "@/lib/ai/errors";
import {
  buildOpenRouterClientPiiProviderPreferences,
  privacyDecisionTraceFields,
  resolveProviderPrivacyForRequest,
} from "@/lib/ai/provider-privacy-policy";
import { resolveCompletionPrivacy } from "@/lib/ai/openai";
import {
  formatCaseMemoryForPrompt,
  mergeCaseMemoryFromClientSnapshot,
  prepareCaseMemoryForModelContext,
} from "@/lib/ai/workspace-case-memory";
import {
  isClientDebtReminderLetterQuery,
} from "@/lib/ai/client-debt-letter";
import { isFinanceNamedClientDebtQuery } from "@/lib/ai/finance-debt-query";
import {
  createEmptyWorkspaceAiTrace,
  markTraceDirect,
  serializeWorkspaceAiTraceForLog,
  assertTraceHasNoSecrets,
} from "@/lib/ai/workspace-trace";
import { shouldUseInternetSearch } from "@/lib/ai/workspace-web-search";
import { logClientStatusDebug } from "@/lib/ai/client-status";

describe("Security Gate 1 privacy policy", () => {
  it("A: client PII + OpenRouter applies ZDR / data_collection deny / no fallbacks", () => {
    const decision = resolveProviderPrivacyForRequest({
      containsClientData: true,
      provider: "openrouter",
      env: { AI_WORKSPACE_CLIENT_PII_PRIVACY: "required" },
    });
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.privacyPolicySatisfied, true);
    assert.deepEqual(decision.openRouterProvider, {
      zdr: true,
      data_collection: "deny",
      allow_fallbacks: false,
    });
    const prefs = buildOpenRouterClientPiiProviderPreferences({});
    assert.equal(prefs.allow_fallbacks, false);
  });

  it("B: client PII + privacy unavailable on direct OpenAI fails closed", () => {
    const decision = resolveProviderPrivacyForRequest({
      containsClientData: true,
      provider: "openai",
      env: {},
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.equal(decision.errorCode, "AI_PRIVACY_POLICY_UNAVAILABLE");
    assert.equal(
      classifyAiFailure("AI_PRIVACY_POLICY_UNAVAILABLE"),
      "AI_PRIVACY_POLICY_UNAVAILABLE",
    );
    assert.match(aiErrorMessage("AI_PRIVACY_POLICY_UNAVAILABLE"), /конфиденциальност/i);
  });

  it("C: provider failure path cannot fall back to unsafe provider preferences", () => {
    const privacy = resolveCompletionPrivacy({
      containsClientData: true,
      provider: "openrouter",
    });
    assert.equal(privacy.decision.ok, true);
    assert.equal(privacy.openRouterProvider?.allow_fallbacks, false);
    assert.equal(privacy.openRouterProvider?.zdr, true);
    assert.equal(privacy.openRouterProvider?.data_collection, "deny");

    const blocked = resolveCompletionPrivacy({
      containsClientData: true,
      provider: "openai",
    });
    assert.equal(blocked.decision.ok, false);
  });

  it("D: non-client generation does not require ZDR provider block", () => {
    const decision = resolveProviderPrivacyForRequest({
      containsClientData: false,
      provider: "openai",
      env: {},
    });
    assert.equal(decision.ok, true);
    assert.equal(decision.policyRequired, false);
    assert.equal(decision.providerPolicyClass, "none");
  });
});

describe("Security Gate 1 logging", () => {
  it("E/F: client status debug does not print FIO", () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      logClientStatusDebug({
        name: "Акунов Тест",
        source: "clients",
        rawStatus: "В работе",
        finalStatus: "В работе",
        derivation: "prep_docs",
      });
    } finally {
      console.log = original;
    }
    const blob = lines.join("\n");
    assert.match(blob, /client-status-debug/);
    assert.doesNotMatch(blob, /Акунов/);
    assert.doesNotMatch(blob, /ФИО/);
    assert.doesNotMatch(blob, /В работе/);
  });
});

describe("Security Gate 1 memory + high sensitivity", () => {
  it("G: passport not persisted from client snapshot", () => {
    const merged = mergeCaseMemoryFromClientSnapshot(null, {
      id: "uuid-1",
      name: "Тестов",
      passportNumber: "SYNTHETIC-PASSPORT",
      bookingAddress: "Synthetic Street 1",
    });
    assert.equal(merged?.passport, null);
    assert.equal(merged?.employers, null);
    assert.equal(merged?.linkedClientId, "uuid-1");
  });

  it("H: old memory passport does not reach model prompt", () => {
    const prepared = prepareCaseMemoryForModelContext({
      clientName: "Тестов",
      citizenship: null,
      passport: "OLD-PASSPORT",
      applicationPlace: null,
      priorResidency: null,
      employers: null,
      dates: null,
      specialNotes: null,
      openQuestions: null,
      linkedClientId: "uuid-1",
      updatedAt: new Date().toISOString(),
    });
    assert.equal(prepared?.passport, null);
    const prompt = formatCaseMemoryForPrompt({
      clientName: "Тестов",
      citizenship: null,
      passport: "OLD-PASSPORT",
      applicationPlace: null,
      priorResidency: null,
      employers: null,
      dates: null,
      specialNotes: null,
      openQuestions: null,
      linkedClientId: "uuid-1",
      updatedAt: new Date().toISOString(),
    });
    assert.doesNotMatch(prompt, /OLD-PASSPORT/);
  });

  it("I: high-sensitivity fields blocked without explicit capability", () => {
    const gated = applyHighSensitivityGateToRecord(
      {
        email: "a@example.com",
        passport: "X",
        dateOfBirth: "2000-01-01",
        bookingAddress: "Street",
        appPassword: "secret",
      },
      createHighSensitivityAllow([]),
    );
    assert.equal(gated.email, "a@example.com");
    assert.equal(gated.passport, undefined);
    assert.equal(gated.dateOfBirth, undefined);
    assert.equal(gated.bookingAddress, undefined);
    assert.equal(gated.appPassword, undefined);

    const rows = filterFieldRowsForModelContext(
      [
        { label: "Email", value: "a@example.com" },
        { label: "Номер паспорта", value: "X" },
        { label: "Дата рождения", value: "2000-01-01" },
      ],
      createHighSensitivityAllow([]),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.label, "Email");
  });
});

describe("Security Gate 1 client lookup logging contract", () => {
  it("E: client-lookup audit uses queryPresent/queryLength (source contract)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "src/lib/ai/client-lookup.ts"),
      "utf8",
    );
    assert.match(src, /queryPresent:\s*true/);
    assert.match(src, /queryLength=\$\{payload\.query\.length\}/);
    assert.match(src, /queryLength:\s*payload\.query\.length/);
    // Must not interpolate raw query into the audit console line.
    assert.doesNotMatch(src, /`\[ai-client-search\][^`]*\$\{payload\.query\}/);
    assert.doesNotMatch(src, /rawQuery/);
  });
});


describe("Security Gate 1 web search + directs", () => {
  it("J: external web search blocked for client PII task", () => {
    assert.equal(queryLooksLikeClientPii("email у Ивановой"), true);
    assert.equal(shouldUseInternetSearch("Найди email Ивановой в интернете"), false);
  });

  it("K/L/M: representative directs do not require Astra", () => {
    assert.equal(isFinanceNamedClientDebtQuery("Сколько должна Тестова?"), true);
    assert.equal(
      isClientDebtReminderLetterQuery(
        "Напиши письмо Тестовой оплатить долг деликатно",
      ),
      true,
    );
    const trace = createEmptyWorkspaceAiTrace(
      "00000000-0000-4000-8000-0000000000aa",
    );
    markTraceDirect(trace);
    trace.selectedRoutes = [
      "finance_client_debt_direct",
      "client_debt_letter_direct",
      "client_fact_direct",
    ];
    trace.responseOk = true;
    assert.equal(trace.astraCalled, false);
    assert.equal(trace.requestClass, "DIRECT");
    assert.equal(trace.providerOutcome, "SKIPPED");
  });

  it("N: privacy trace fields are metadata-only", () => {
    const decision = resolveProviderPrivacyForRequest({
      containsClientData: true,
      provider: "openrouter",
    });
    const fields = privacyDecisionTraceFields(decision);
    assert.equal(fields.privacyPolicyRequired, true);
    assert.equal(fields.privacyPolicySatisfied, true);
    const blob = JSON.stringify(fields);
    assert.doesNotMatch(blob, /passport|email|messages|prompt/i);

    const trace = createEmptyWorkspaceAiTrace(
      "00000000-0000-4000-8000-0000000000bb",
    );
    const serialized = serializeWorkspaceAiTraceForLog(trace);
    assert.ok(
      assertTraceHasNoSecrets(serialized, [
        "Bearer sk-secret",
        "appPassword",
      ]),
    );
  });
});
