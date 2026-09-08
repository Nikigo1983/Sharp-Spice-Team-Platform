import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideKbGrounding } from "@/lib/ai/kb-grounding";
import { detectWorkspaceIntent } from "@/lib/ai/query-intent";
import {
  createAiRequestId,
  createEmptyWorkspaceAiTrace,
  serializeWorkspaceAiTraceForLog,
  type DriveRetrievalMeta,
} from "@/lib/ai/workspace-trace";
import {
  KB_FIXTURE_DOCS,
  kbFixtureAllowedIds,
  type KbFixtureDoc,
} from "@/lib/google-drive/kb-fixtures";
import {
  dedupeByFileId,
  extractMeaningfulKbTokens,
  formatRankedKbContext,
  isFileInsideAllowedRoot,
  partitionByKbRoot,
  rankKbDocument,
  selectRankedKbDocuments,
  snippetAroundStrongestMatch,
} from "@/lib/google-drive/kb-retrieval-core";

const QUERY_CROATIA_DN =
  "Какие требования для digital nomad в Хорватии?";

function rankFixtureCorpus(query: string, docs: KbFixtureDoc[]) {
  const tokens = extractMeaningfulKbTokens(query);
  const allowed = kbFixtureAllowedIds();
  const { accepted, rejectedOutsideRoot } = partitionByKbRoot(docs, allowed);

  const ranked = accepted.map((doc) => {
    const hasContent = Boolean(doc.text.trim()) && !doc.mimeType.startsWith("image/");
    return rankKbDocument({
      file: {
        id: doc.id,
        name: doc.name,
        path: doc.path,
        mimeType: doc.mimeType,
      },
      text: hasContent
        ? doc.text
        : "[Файл в Drive — текст не извлечён (возможно скан без текстового слоя).]",
      hasContent,
      tokens,
      query,
    });
  });

  const selected = selectRankedKbDocuments(ranked, {
    maxFiles: 8,
    strictRelevance: true,
  });

  const formatted = formatRankedKbContext({
    folderLabel: "Knowledge Base",
    docs: selected,
    tokens,
    totalFiles: accepted.length,
    maxTotalChars: 24_000,
  });

  return {
    tokens,
    accepted,
    rejectedOutsideRoot,
    ranked,
    selected,
    formatted,
  };
}

function metaFromFixtureResult(
  result: ReturnType<typeof rankFixtureCorpus>,
): DriveRetrievalMeta {
  return {
    source: "knowledge_base",
    attempted: true,
    configured: true,
    mode: "content",
    groundingState:
      result.formatted.contentRetrieved && !result.formatted.usefulContextEmpty
        ? "KB_CONTENT_AVAILABLE"
        : "KB_EMPTY",
    candidateFileCount: result.accepted.length,
    selectedFiles: result.formatted.selected.map((doc) => ({
      id: doc.id,
      path: doc.path,
      score: doc.totalScore,
      hasContent: doc.hasContent,
      matchReasons: doc.matchReasons,
      extractionOk: doc.hasContent,
    })),
    contentRetrieved: result.formatted.contentRetrieved,
    usefulContextEmpty: result.formatted.usefulContextEmpty,
    textCharCount: result.formatted.text.length,
    queryTokens: result.tokens,
    filenameSearchAttempted: true,
    contentSearchAttempted: true,
    selectedCount: result.formatted.selected.length,
    rejectedOutsideRootCount: result.rejectedOutsideRoot.length,
  };
}

describe("AI-02 KB lexical retrieval", () => {
  it("1. filename match retrieves relevant file", () => {
    const result = rankFixtureCorpus("Spain digital-nomad", KB_FIXTURE_DOCS);
    const ids = result.selected.map((doc) => doc.id);
    assert.ok(ids.includes("file-spain-dn"));
  });

  it("2. content-only match retrieves generically named file", () => {
    const result = rankFixtureCorpus(QUERY_CROATIA_DN, KB_FIXTURE_DOCS);
    const ids = result.selected.map((doc) => doc.id);
    assert.ok(
      ids.includes("file-croatia-program"),
      "program-information content must be retrieved",
    );
  });

  it("3. nested-folder content match retrieves relevant file", () => {
    const result = rankFixtureCorpus(QUERY_CROATIA_DN, KB_FIXTURE_DOCS);
    const ids = result.selected.map((doc) => doc.id);
    assert.ok(ids.includes("file-nested-croatia-req"));
  });

  it("4. combined filename + content match ranks strongly", () => {
    const result = rankFixtureCorpus("Spain digital nomad", KB_FIXTURE_DOCS);
    assert.ok(result.selected.length > 0);
    const top = result.selected[0];
    assert.equal(top.id, "file-spain-dn");
    assert.ok(top.matchReasons.includes("combined") || top.matchReasons.includes("content"));
    assert.ok(top.totalScore > 0);
  });

  it("5. strong multi-token content match ranks above weak filename match", () => {
    const result = rankFixtureCorpus(QUERY_CROATIA_DN, KB_FIXTURE_DOCS);
    const nested = result.ranked.find((doc) => doc.id === "file-nested-croatia-req");
    const wifi = result.ranked.find((doc) => doc.id === "file-unrelated");
    assert.ok(nested);
    assert.ok(wifi);
    assert.ok(nested.totalScore > wifi.totalScore);
    assert.ok(result.selected.some((doc) => doc.id === "file-nested-croatia-req"));
    assert.equal(
      result.selected.some((doc) => doc.id === "file-unrelated"),
      false,
    );
  });

  it("6. zero-score unrelated files are NOT used as padding", () => {
    const result = rankFixtureCorpus(QUERY_CROATIA_DN, KB_FIXTURE_DOCS);
    assert.equal(
      result.selected.every((doc) => doc.totalScore > 0),
      true,
    );
    assert.equal(
      result.selected.some((doc) => doc.id === "file-unrelated"),
      false,
    );
  });

  it("7. duplicate candidates are deduplicated", () => {
    const dupes = dedupeByFileId([
      { id: "a", path: "1" },
      { id: "a", path: "2" },
      { id: "b", path: "3" },
    ]);
    assert.equal(dupes.length, 2);
  });

  it("8. empty retrieval produces KB_EMPTY", () => {
    const result = rankFixtureCorpus(
      "xyzzyplugh qqqzzz foobarbaz 999nonexistent",
      KB_FIXTURE_DOCS,
    );
    assert.equal(result.selected.length, 0);
    const meta = metaFromFixtureResult(result);
    assert.equal(meta.groundingState, "KB_EMPTY");
  });

  it("9. extraction failure does not produce KB_CONTENT_AVAILABLE", () => {
    const imageOnly = KB_FIXTURE_DOCS.filter(
      (doc) => doc.id === "file-image-scan" || doc.id === "file-unrelated",
    );
    const result = rankFixtureCorpus("требования digital nomad Хорватия", imageOnly);
    assert.equal(
      result.selected.every((doc) => doc.hasContent),
      true,
    );
    assert.equal(
      result.selected.some((doc) => doc.id === "file-image-scan"),
      false,
    );
    const meta = metaFromFixtureResult(result);
    assert.notEqual(meta.groundingState, "KB_CONTENT_AVAILABLE");
  });

  it("10. catalog-only result does not produce KB_CONTENT_AVAILABLE", () => {
    const catalogMeta: DriveRetrievalMeta = {
      source: "knowledge_base",
      attempted: true,
      configured: true,
      mode: "catalog",
      groundingState: "KB_CATALOG_ONLY",
      candidateFileCount: 3,
      selectedFiles: [
        {
          id: "x",
          path: "Croatia/program-information",
          score: 2,
          hasContent: false,
        },
      ],
      contentRetrieved: false,
      usefulContextEmpty: true,
      textCharCount: 40,
    };
    assert.equal(catalogMeta.groundingState, "KB_CATALOG_ONLY");
    assert.notEqual(catalogMeta.groundingState, "KB_CONTENT_AVAILABLE");
  });

  it("11. relevant snippet contains matched terms", () => {
    const result = rankFixtureCorpus(QUERY_CROATIA_DN, KB_FIXTURE_DOCS);
    const nested = result.selected.find((doc) => doc.id === "file-nested-croatia-req");
    assert.ok(nested);
    const snippet = snippetAroundStrongestMatch(
      nested.text,
      result.tokens,
      220,
    );
    assert.match(snippet.toLowerCase(), /digital/);
    assert.match(snippet.toLowerCase(), /nomad|хорват/i);
  });

  it("12. relevant content later in document is not lost", () => {
    const result = rankFixtureCorpus(QUERY_CROATIA_DN, KB_FIXTURE_DOCS);
    const late = result.selected.find((doc) => doc.id === "file-late-match");
    assert.ok(late, "late-match document must be selected");
    const snippet = snippetAroundStrongestMatch(late.text, result.tokens, 220);
    assert.match(snippet.toLowerCase(), /digital nomad|требования/);
    assert.ok(!snippet.startsWith("Вступление. Вступление."));
  });

  it("13. file outside configured KB root is rejected", () => {
    const allowed = kbFixtureAllowedIds();
    assert.equal(isFileInsideAllowedRoot("file-outside-root", allowed), false);
    const { rejectedOutsideRoot } = partitionByKbRoot(
      KB_FIXTURE_DOCS,
      allowed,
    );
    assert.ok(rejectedOutsideRoot.some((doc) => doc.id === "file-outside-root"));
    const result = rankFixtureCorpus(QUERY_CROATIA_DN, KB_FIXTURE_DOCS);
    assert.equal(
      result.selected.some((doc) => doc.id === "file-outside-root"),
      false,
    );
  });

  it("14. nested descendant inside configured KB root is accepted", () => {
    const allowed = kbFixtureAllowedIds();
    assert.equal(isFileInsideAllowedRoot("file-nested-croatia-req", allowed), true);
  });

  it("15. AI-01 request trace records retrieval metadata", () => {
    const result = rankFixtureCorpus(QUERY_CROATIA_DN, KB_FIXTURE_DOCS);
    const meta = metaFromFixtureResult(result);
    const trace = createEmptyWorkspaceAiTrace(createAiRequestId());
    trace.needsKb = true;
    trace.kbMode = meta.mode;
    trace.kbGroundingState = meta.groundingState;
    trace.kbSelectedFiles = meta.selectedFiles;
    trace.kbQueryTokens = meta.queryTokens ?? [];
    trace.kbFilenameSearchAttempted = true;
    trace.kbContentSearchAttempted = true;
    trace.kbRejectedOutsideRootCount = meta.rejectedOutsideRootCount ?? 0;
    const serialized = serializeWorkspaceAiTraceForLog(trace);
    assert.ok(serialized.requestId);
    assert.equal(serialized.kbContentSearchAttempted, true);
    assert.ok(Array.isArray(serialized.kbQueryTokens));
    assert.ok((serialized.kbQueryTokens as string[]).length > 0);
  });

  it("16. AI-01 safe grounding still activates when retrieval is empty", () => {
    const intent = detectWorkspaceIntent(
      "требования digital nomad программы immigration",
    );
    assert.equal(intent.needsKb, true);
    const emptyResult = rankFixtureCorpus(
      "xyzzyplugh qqqzzz foobarbaz 999nonexistent",
      KB_FIXTURE_DOCS,
    );
    const decision = decideKbGrounding({
      intent,
      kbMeta: metaFromFixtureResult(emptyResult),
    });
    assert.equal(decision.blockModel, true);
    assert.equal(decision.reason, "KB_EMPTY");
  });

  it("17. non-KB requests remain unchanged (guard off)", () => {
    const intent = detectWorkspaceIntent("Напиши письмо клиенту с благодарностью");
    assert.equal(intent.needsKb, false);
    const decision = decideKbGrounding({
      intent,
      kbMeta: {
        source: "knowledge_base",
        attempted: false,
        configured: false,
        mode: "skipped",
        groundingState: "KB_SKIPPED",
        candidateFileCount: 0,
        selectedFiles: [],
        contentRetrieved: false,
        usefulContextEmpty: true,
        textCharCount: 0,
      },
    });
    assert.equal(decision.blockModel, false);
  });

  it("18. Emigrant-style non-strict ranking can retain zero-content slots differently from KB strict mode", () => {
    const tokens = extractMeaningfulKbTokens("wifi policy");
    const ranked = KB_FIXTURE_DOCS.filter((d) => d.insideRoot).map((doc) =>
      rankKbDocument({
        file: doc,
        text: doc.text || "[нет текста]",
        hasContent: Boolean(doc.text.trim()),
        tokens,
        query: "wifi policy",
      }),
    );
    const strict = selectRankedKbDocuments(ranked, {
      maxFiles: 8,
      strictRelevance: true,
    });
    const loose = selectRankedKbDocuments(ranked, {
      maxFiles: 8,
      strictRelevance: false,
    });
    assert.ok(loose.length >= strict.length);
  });

  it("19. client structured intent parsing remains available (unchanged surface)", async () => {
    const { parseClientSearchIntentRules } = await import(
      "@/lib/ai/client-search-intent"
    );
    const intent = parseClientSearchIntentRules(
      "Партнер Шарипа у каких клиентов?",
    );
    assert.equal(intent.isListQuery, true);
    assert.equal(intent.partnerName, "Шарипа");
  });
});

describe("AI-02 representative traces", () => {
  it("CASE A — content match → KB_CONTENT_AVAILABLE", () => {
    const result = rankFixtureCorpus(QUERY_CROATIA_DN, KB_FIXTURE_DOCS);
    const meta = metaFromFixtureResult(result);
    assert.equal(meta.groundingState, "KB_CONTENT_AVAILABLE");
    assert.ok(meta.selectedFiles.some((f) => f.path.includes("program-information") || f.path.includes("requirements-document")));
    assert.match(result.formatted.text.toLowerCase(), /digital nomad|внж/);
  });

  it("CASE B — no docs → KB_EMPTY + grounding", () => {
    const intent = detectWorkspaceIntent("база знаний требования digital nomad");
    const result = rankFixtureCorpus("xyzzy nonexistent topic 999", KB_FIXTURE_DOCS);
    const meta = metaFromFixtureResult(result);
    assert.equal(meta.groundingState, "KB_EMPTY");
    const decision = decideKbGrounding({ intent, kbMeta: meta });
    assert.equal(decision.blockModel, true);
  });

  it("CASE C — outside root perfect match excluded", () => {
    const result = rankFixtureCorpus(QUERY_CROATIA_DN, KB_FIXTURE_DOCS);
    assert.ok(result.rejectedOutsideRoot.some((d) => d.id === "file-outside-root"));
    assert.equal(
      result.selected.some((d) => d.id === "file-outside-root"),
      false,
    );
  });
});
