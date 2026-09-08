import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideKbGrounding } from "@/lib/ai/kb-grounding";
import { detectWorkspaceIntent } from "@/lib/ai/query-intent";
import {
  createAiRequestId,
  createEmptyWorkspaceAiTrace,
  applyRoutingDecisionToTrace,
  serializeWorkspaceAiTraceForLog,
} from "@/lib/ai/workspace-trace";
import {
  ROUTING_EVAL_CASES,
  summarizeRoutingEvalCategories,
} from "@/lib/ai/workspace-routing-eval";
import {
  parseAiRouterJson,
  resolveWorkspaceRoutingSync,
  getWorkspaceRouterModel,
} from "@/lib/ai/workspace-router";
import {
  isGeneralKnowledgeQuery,
  routeWorkspaceQueryByRules,
} from "@/lib/ai/workspace-router-rules";
import type { WorkspaceRouteSource } from "@/lib/ai/workspace-router-types";

function assertSourcesMatch(
  actual: WorkspaceRouteSource[],
  expected: WorkspaceRouteSource[],
  forbidden: WorkspaceRouteSource[] = [],
) {
  for (const source of expected) {
    assert.ok(
      actual.includes(source),
      `expected source ${source}, got [${actual.join(", ")}]`,
    );
  }
  for (const source of forbidden) {
    assert.equal(
      actual.includes(source),
      false,
      `forbidden source ${source} present in [${actual.join(", ")}]`,
    );
  }
}

describe("AI-03 required regression A–H", () => {
  it("A. general ВНЖ documents → KB, not Emigrant Drive", () => {
    const decision = resolveWorkspaceRoutingSync(
      "Какие документы нужны для ВНЖ в Хорватии?",
    );
    assertSourcesMatch(decision.sources, ["knowledge_base"], [
      "emigrant_drive",
      "clients",
    ]);
    assert.equal(decision.workspaceIntent.needsKb, true);
    assert.equal(decision.workspaceIntent.needsClients, false);
    assert.equal(decision.workspaceIntent.needsEmigrantDrive, false);
  });

  it("B. uploaded docs for named client → client/drive", () => {
    const decision = resolveWorkspaceRoutingSync(
      "Какие документы загрузил Иван Петров?",
    );
    assertSourcesMatch(decision.sources, ["clients", "emigrant_drive"]);
  });

  it("C. missing docs vs ВНЖ → multi-source", () => {
    const decision = resolveWorkspaceRoutingSync(
      "Каких документов не хватает Ивану Петрову для ВНЖ в Хорватии?",
    );
    assertSourcesMatch(decision.sources, [
      "clients",
      "emigrant_drive",
      "knowledge_base",
    ]);
  });

  it("D. digital nomad requirements → KB", () => {
    const decision = resolveWorkspaceRoutingSync(
      "Расскажи требования digital nomad",
    );
    assertSourcesMatch(decision.sources, ["knowledge_base"], ["clients"]);
  });

  it("E. polite generic letter → generation", () => {
    const decision = resolveWorkspaceRoutingSync(
      "Напиши вежливое письмо клиенту с напоминанием",
    );
    assert.deepEqual(decision.sources, []);
    assert.equal(decision.intentLabel, "generation");
  });

  it("F. letter naming missing docs for Ivan → client context", () => {
    const decision = resolveWorkspaceRoutingSync(
      "Напиши Ивану письмо и укажи, какие документы у него отсутствуют",
    );
    assertSourcesMatch(decision.sources, ["clients", "emigrant_drive"]);
  });

  it("G. clients in Croatia → CLIENTS", () => {
    const decision = resolveWorkspaceRoutingSync("Покажи клиентов из Хорватии");
    assertSourcesMatch(decision.sources, ["clients"], ["knowledge_base"]);
  });

  it("H. What is digital nomad → KB (program knowledge)", () => {
    const decision = resolveWorkspaceRoutingSync("Что такое digital nomad?");
    assertSourcesMatch(decision.sources, ["knowledge_base"], [
      "clients",
      "emigrant_drive",
    ]);
  });
});

describe("AI-03 routing behavior", () => {
  it("1–2. KB paraphrase without explicit KB keyword", () => {
    assert.equal(
      isGeneralKnowledgeQuery("Что нужно для получения ВНЖ в Хорватии?"),
      true,
    );
    const intent = detectWorkspaceIntent(
      "Что нужно для получения ВНЖ в Хорватии?",
    );
    assert.equal(intent.needsKb, true);
    assert.equal(intent.needsClients, false);
  });

  it("3–5. client docs vs generic documents required", () => {
    const generic = resolveWorkspaceRoutingSync(
      "Какие документы нужны для ВНЖ?",
    );
    assert.equal(generic.workspaceIntent.needsKb, true);
    assert.equal(generic.workspaceIntent.needsEmigrantDrive, false);

    const uploaded = resolveWorkspaceRoutingSync(
      "Какие документы загрузил Иван Петров?",
    );
    assert.equal(uploaded.workspaceIntent.needsEmigrantDrive, true);
    assert.equal(uploaded.workspaceIntent.needsClients, true);
  });

  it("6. multi-source comparison", () => {
    const decision = resolveWorkspaceRoutingSync(
      "Сравни загруженные документы Петра с требованиями ВНЖ",
    );
    assert.ok(decision.sources.includes("knowledge_base"));
    assert.ok(decision.sources.includes("emigrant_drive"));
  });

  it("7–8. pure writing does not load KB or clients", () => {
    const decision = resolveWorkspaceRoutingSync(
      "Сделай этот текст более профессиональным",
    );
    assert.deepEqual(decision.sources, []);
    assert.equal(decision.workspaceIntent.needsKb, false);
    assert.equal(decision.workspaceIntent.needsClients, false);
  });

  it("9. client writing with missing docs loads client data", () => {
    const decision = resolveWorkspaceRoutingSync(
      "Напиши Анне письмо о недостающих документах",
    );
    assert.ok(decision.workspaceIntent.needsClients || decision.sources.includes("clients"));
    assert.ok(decision.sources.includes("emigrant_drive"));
  });

  it("10. client list query preserves clients source", () => {
    const decision = resolveWorkspaceRoutingSync(
      "Покажи клиентов менеджера Saša",
    );
    assert.equal(decision.workspaceIntent.needsClients, true);
  });

  it("11. malformed router JSON rejected", () => {
    assert.equal(parseAiRouterJson("not json"), null);
    assert.equal(
      parseAiRouterJson('{"intent":"knowledge","sources":["magic_db"],"requires_authoritative_data":true,"confidence":0.9,"reason":"x"}'),
      null,
    );
  });

  it("12–13. unknown source rejected; low confidence does not invent load-all", () => {
    assert.equal(
      parseAiRouterJson(
        '{"intent":"knowledge","sources":["knowledge_base","not_a_source"],"requires_authoritative_data":true,"confidence":0.9,"reason":"x"}',
      ),
      null,
    );
    const ambiguous = routeWorkspaceQueryByRules("hmm interesting stuff maybe");
    assert.equal(ambiguous.highConfidence, false);
    assert.deepEqual(ambiguous.decision.sources, []);
  });

  it("14. valid AI JSON accepts known sources only", () => {
    const parsed = parseAiRouterJson(
      '{"intent":"knowledge","sources":["knowledge_base"],"requires_authoritative_data":true,"confidence":0.91,"reason":"program_rules"}',
    );
    assert.ok(parsed);
    assert.deepEqual(parsed?.sources, ["knowledge_base"]);
  });

  it("15–16. AI-01 trace records routing method and sources", () => {
    const decision = resolveWorkspaceRoutingSync(
      "Какие документы нужны для ВНЖ в Хорватии?",
    );
    const trace = createEmptyWorkspaceAiTrace(createAiRequestId());
    applyRoutingDecisionToTrace(trace, decision);
    const serialized = serializeWorkspaceAiTraceForLog(trace);
    assert.equal(serialized.routingMethod, "RULE");
    assert.ok((serialized.selectedRoutes as string[]).includes("knowledge_base"));
    assert.equal(serialized.needsKb, true);
    assert.equal(serialized.needsClients, false);
  });

  it("17–18. AI-02 grounding still keyed off needsKb", () => {
    const intent = detectWorkspaceIntent("требования digital nomad программы");
    assert.equal(intent.needsKb, true);
    const decision = decideKbGrounding({
      intent,
      kbMeta: {
        source: "knowledge_base",
        attempted: true,
        configured: true,
        mode: "content",
        groundingState: "KB_EMPTY",
        candidateFileCount: 0,
        selectedFiles: [],
        contentRetrieved: false,
        usefulContextEmpty: true,
        textCharCount: 0,
      },
    });
    assert.equal(decision.blockModel, true);
  });

  it("19. direct passport command still clients-only", () => {
    const intent = detectWorkspaceIntent(
      "Какой номер паспорта у клиента Белоус Екатерина?",
    );
    assert.equal(intent.needsClients, true);
    assert.equal(intent.needsEmigrantDrive, false);
    assert.equal(intent.fastClientLookup, true);
  });

  it("20. unconditional clients attachment removed for KB questions", () => {
    const intent = detectWorkspaceIntent(
      "Какие документы нужны для ВНЖ в Хорватии?",
    );
    assert.equal(intent.needsClients, false);
    assert.equal(intent.needsFormgrid, false);
  });

  it("router model env is independently readable", () => {
    const model = getWorkspaceRouterModel();
    assert.equal(typeof model, "string");
    assert.ok(model.length > 0);
  });
});

describe("AI-03 evaluation dataset (deterministic rules)", () => {
  it("has at least 40 fixtures across categories", () => {
    assert.ok(ROUTING_EVAL_CASES.length >= 40);
    const summary = summarizeRoutingEvalCategories();
    assert.ok((summary.knowledge_base ?? 0) >= 8);
    assert.ok((summary.clients ?? 0) >= 4);
    assert.ok((summary.generation ?? 0) >= 3);
  });

  for (const fixture of ROUTING_EVAL_CASES) {
    it(`eval ${fixture.id}: ${fixture.category}`, () => {
      const decision = resolveWorkspaceRoutingSync(fixture.query);
      assertSourcesMatch(
        decision.sources,
        fixture.expectedSources,
        fixture.forbiddenSources,
      );
    });
  }
});
