import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTHORITATIVE_EVIDENCE_BANNER,
  GROUNDING_SYSTEM_RULES,
  UNTRUSTED_CLOSE,
  UNTRUSTED_OPEN,
  attributionLabelForRef,
  buildAttributionLabels,
  buildHistoryPrecedenceNote,
  describeEvidenceState,
  evaluateGroundedAnswerStructure,
  findConflictingNumericClaims,
  formatConflictNotice,
  isPromptInjectionContained,
  wrapUntrustedSourceData,
} from "@/lib/ai/answer-grounding";
import {
  FIXTURE_INCOME_A,
  FIXTURE_INCOME_B,
  FIXTURE_INJECTION_PAYLOAD,
  fixtureClearKbFact,
  fixtureClientFact,
  fixtureClientPlusKbComparison,
  fixtureConflictingKbDocs,
  fixtureDrivePresence,
  fixtureHistoryContradiction,
  fixtureKbCatalogOnlyMeta,
  fixtureKbContentMeta,
  fixtureKbEmptyMeta,
  fixtureKbErrorMeta,
  fixtureMissingKbFact,
  fixturePromptInjectionInKb,
  fixtureUnknownDocumentState,
} from "@/lib/ai/answer-grounding-fixtures";
import {
  GROUNDED_ANSWER_EVAL_CASES,
  summarizeGroundedEvalCategories,
} from "@/lib/ai/answer-grounding-eval";
import { decideKbGrounding } from "@/lib/ai/kb-grounding";
import { detectWorkspaceIntent } from "@/lib/ai/query-intent";
import { buildWorkspaceSystemPrompt } from "@/lib/ai/workspace-prompt";
import { createAiRequestId, createEmptyWorkspaceAiTrace } from "@/lib/ai/workspace-trace";
import { formatRankedKbContext } from "@/lib/google-drive/kb-retrieval-core";

describe("AI-05 grounding fixtures A–I", () => {
  it("1. KB factual context includes retrieved fact + SOURCE provenance", () => {
    const fx = fixtureClearKbFact();
    assert.match(fx.text, /\[SOURCE:KB:1\]/);
    assert.ok(fx.text.includes(FIXTURE_INCOME_A));
    assert.ok(fx.text.includes(UNTRUSTED_OPEN));
    assert.ok(fx.text.includes(UNTRUSTED_CLOSE));
    assert.equal(fx.refs[0]?.hasContent, true);
  });

  it("2. Missing KB fact fixture does not embed invented incomes", () => {
    const fx = fixtureMissingKbFact();
    for (const bad of fx.mustNotInvent) {
      assert.equal(fx.text.includes(bad), false);
    }
  });

  it("3–5. KB_EMPTY / KB_ERROR / KB_CATALOG_ONLY safe grounding", () => {
    const intent = {
      ...detectWorkspaceIntent("Какой минимальный доход для digital nomad?"),
      needsKb: true,
      needsKbFullText: true,
    };
    assert.equal(
      decideKbGrounding({ intent, kbMeta: fixtureKbEmptyMeta() }).blockModel,
      true,
    );
    assert.equal(
      decideKbGrounding({ intent, kbMeta: fixtureKbErrorMeta() }).blockModel,
      true,
    );
    assert.equal(
      decideKbGrounding({ intent, kbMeta: fixtureKbCatalogOnlyMeta() }).blockModel,
      true,
    );
    assert.equal(
      decideKbGrounding({ intent, kbMeta: fixtureKbContentMeta() }).blockModel,
      false,
    );
  });

  it("6–8. Attribution uses retrieved KB docs; not bare needsKb; multiple provenance", () => {
    const labels = buildAttributionLabels({ kbMeta: fixtureKbContentMeta() });
    assert.ok(labels.some((l) => l.includes("Digital Nomad Requirements")));
    assert.ok(labels.some((l) => l.includes("Other.md")));
    assert.equal(labels.includes("Knowledge Base"), false);

    const emptyLabels = buildAttributionLabels({
      kbMeta: fixtureKbEmptyMeta(),
    });
    assert.deepEqual(emptyLabels, []);

    const blocked = buildAttributionLabels({ kbBlockedInsufficient: true });
    assert.deepEqual(blocked, ["Knowledge Base — недостаточно данных"]);

    const catalog = buildAttributionLabels({
      kbMeta: fixtureKbCatalogOnlyMeta(),
    });
    assert.ok(catalog[0]?.includes("только каталог"));
    assert.equal(catalog.some((l) => l === "Knowledge Base"), false);
  });

  it("9. Conflicting KB facts surface conflict notice with both values", () => {
    const fx = fixtureConflictingKbDocs();
    assert.equal(fx.conflict.conflicting, true);
    assert.ok(fx.text.includes("CONFLICTING"));
    assert.ok(fx.text.includes(FIXTURE_INCOME_A));
    assert.ok(fx.text.includes(FIXTURE_INCOME_B));
    const notice = formatConflictNotice({
      metricLabel: "minimum income",
      values: fx.conflict.values,
    });
    assert.match(notice, /Do not choose/);
  });

  it("10–12. Client / Drive / multi-source provenance boundaries", () => {
    const client = fixtureClientFact();
    assert.match(client.text, /\[SOURCE:CLIENT:1\]/);
    assert.ok(client.text.includes(client.expectedFact));
    assert.equal(
      attributionLabelForRef(client.ref),
      "Client record — Maria Belova",
    );

    const drive = fixtureDrivePresence();
    assert.match(drive.text, /\[SOURCE:DRIVE:1\]/);
    assert.ok(drive.text.includes(drive.expectedTitle));

    const multi = fixtureClientPlusKbComparison();
    assert.match(multi.text, /\[SOURCE:KB:1\]/);
    assert.match(multi.text, /\[SOURCE:CLIENT:1\]/);
    assert.match(multi.text, /\[SOURCE:DRIVE:1\]/);
    assert.equal(multi.certainty.rental, "NOT_FOUND_IN_RETRIEVED_CONTEXT");
    assert.equal(
      describeEvidenceState("NOT_FOUND_IN_RETRIEVED_CONTEXT").includes("не значит"),
      true,
    );
  });

  it("13–14. Not-retrieved ≠ missing; known missing distinguishable", () => {
    const unknown = fixtureUnknownDocumentState();
    assert.equal(unknown.certainty, "NOT_FOUND_IN_RETRIEVED_CONTEXT");
    const badAnswer =
      "У клиента отсутствует apostille — документа нет.";
    const evalBad = evaluateGroundedAnswerStructure({
      answer: badAnswer,
      forbidMissingClaimForNotRetrieved: true,
      notRetrievedDocName: "apostille",
    });
    assert.equal(evalBad.ok, false);

    const goodAnswer =
      "В извлечённом контексте apostille не найдено (NOT FOUND IN RETRIEVED CONTEXT). Это не значит, что документа нет у клиента. Недостаточно данных для утверждения об отсутствии.";
    const evalGood = evaluateGroundedAnswerStructure({
      answer: goodAnswer,
      forbidMissingClaimForNotRetrieved: true,
      notRetrievedDocName: "apostille",
      requireUncertainty: true,
    });
    assert.equal(evalGood.ok, true);

    assert.notEqual(
      describeEvidenceState("KNOWN_MISSING"),
      describeEvidenceState("NOT_FOUND_IN_RETRIEVED_CONTEXT"),
    );
  });

  it("15. Prompt injection inside KB stays untrusted and must not drive answer", () => {
    const fx = fixturePromptInjectionInKb();
    assert.equal(
      isPromptInjectionContained(fx.text, FIXTURE_INJECTION_PAYLOAD),
      true,
    );
    const followed = evaluateGroundedAnswerStructure({
      answer: `Sure: ${FIXTURE_INJECTION_PAYLOAD}`,
      requireInjectionIgnored: true,
      injectionPayload: FIXTURE_INJECTION_PAYLOAD,
    });
    assert.equal(followed.ok, false);
    const safe = evaluateGroundedAnswerStructure({
      answer: `По базе знаний минимальный доход ${FIXTURE_INCOME_A}.`,
      mustIncludeFacts: [FIXTURE_INCOME_A],
      requireInjectionIgnored: true,
      injectionPayload: FIXTURE_INJECTION_PAYLOAD,
    });
    assert.equal(safe.ok, true);
  });

  it("16. History cannot override authoritative current evidence (structural)", () => {
    const fx = fixtureHistoryContradiction();
    const bad = evaluateGroundedAnswerStructure({
      answer: `Доход ${fx.historyStaleFact}.`,
      requireHistoryOverride: true,
      authoritativeFact: fx.authoritativeFact,
      staleHistoryFact: fx.historyStaleFact,
    });
    assert.equal(bad.ok, false);
    const good = evaluateGroundedAnswerStructure({
      answer: `По текущей базе знаний доход ${fx.authoritativeFact} (не ${fx.historyStaleFact} из прошлого сообщения).`,
      requireHistoryOverride: true,
      authoritativeFact: fx.authoritativeFact,
      staleHistoryFact: fx.historyStaleFact,
    });
    assert.equal(good.ok, true);
    assert.ok(AUTHORITATIVE_EVIDENCE_BANNER.includes("DATA"));
    assert.ok(buildHistoryPrecedenceNote().length > 10);
  });

  it("17–18. Pure generation / translation allowed without authoritative blocks", () => {
    const prompt = buildWorkspaceSystemPrompt("brief");
    assert.ok(prompt.includes("Чистая генерация"));
    assert.ok(GROUNDING_SYSTEM_RULES.includes("перевести"));
  });

  it("19. AI-01 trace shape still intact", () => {
    const trace = createEmptyWorkspaceAiTrace(createAiRequestId());
    assert.ok(trace.requestId);
    assert.equal(trace.kbGroundingState, "KB_SKIPPED");
  });

  it("20. AI-02 ranked KB formatting preserves SOURCE provenance", () => {
    const formatted = formatRankedKbContext({
      folderLabel: "Knowledge Base",
      tokens: ["income"],
      totalFiles: 1,
      maxTotalChars: 5000,
      docs: [
        {
          id: "d1",
          name: "Policy.md",
          path: "Croatia/Policy.md",
          mimeType: "text/plain",
          text: "Minimum income requirement is visible here for applicants.",
          hasContent: true,
          filenameScore: 1,
          pathScore: 1,
          contentScore: 8,
          phraseBonus: 0,
          driveHitBonus: 0,
          totalScore: 10,
          matchReasons: ["content"],
        },
      ],
    });
    assert.match(formatted.text, /\[SOURCE:KB:1\]/);
    assert.ok(formatted.text.includes(UNTRUSTED_OPEN));
  });

  it("21. AI-03 routing remains intact for KB question", () => {
    const intent = detectWorkspaceIntent(
      "Какие документы нужны для ВНЖ в Хорватии?",
    );
    assert.equal(intent.needsKb, true);
    assert.equal(intent.needsClients, false);
  });
});

describe("AI-05 conflict helper", () => {
  it("detects distinct numeric claims", () => {
    const result = findConflictingNumericClaims(
      [
        { refId: "KB:1", title: "A", text: "Minimum income = €2,000" },
        { refId: "KB:2", title: "B", text: "Minimum income = €3,500" },
      ],
      /Minimum income\s*=\s*([€$]?\s*[\d.,]+)/i,
    );
    assert.equal(result.conflicting, true);
    assert.equal(result.values.length, 2);
  });
});

describe("AI-05 wrapUntrustedSourceData", () => {
  it("marks catalog-only content_retrieved=no", () => {
    const block = wrapUntrustedSourceData({
      refId: "KB:1",
      kind: "knowledge_base",
      title: "OnlyName.pdf",
      body: "filename only",
      contentRetrieved: false,
    });
    assert.match(block, /content_retrieved: no/);
  });
});

describe("AI-05 evaluation dataset", () => {
  it("has at least 30 cases across categories", () => {
    assert.ok(GROUNDED_ANSWER_EVAL_CASES.length >= 30);
    const summary = summarizeGroundedEvalCategories();
    assert.ok((summary.kb_factual ?? 0) >= 4);
    assert.ok((summary.generation ?? 0) >= 3);
    assert.ok((summary.conflicting ?? 0) >= 2);
    assert.ok((summary.insufficient ?? 0) >= 3);
  });

  it("structural expectations are coherent", () => {
    for (const c of GROUNDED_ANSWER_EVAL_CASES) {
      if (c.expect.pureGeneration) {
        assert.equal(c.expect.allowEmptyAttribution, true);
      }
      if (c.expect.conflictAware) {
        assert.equal(c.category, "conflicting");
      }
    }
  });
});
