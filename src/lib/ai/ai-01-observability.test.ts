import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideKbGrounding,
  KB_SAFE_GROUNDING_REPLY,
} from "@/lib/ai/kb-grounding";
import { detectWorkspaceIntent } from "@/lib/ai/query-intent";
import { runWorkspaceAi } from "@/lib/ai/workspace-assistant";
import {
  assertTraceHasNoSecrets,
  createAiRequestId,
  createEmptyWorkspaceAiTrace,
  serializeWorkspaceAiTraceForLog,
  type DriveRetrievalMeta,
} from "@/lib/ai/workspace-trace";

function kbMeta(
  partial: Partial<DriveRetrievalMeta> &
    Pick<DriveRetrievalMeta, "groundingState" | "mode">,
): DriveRetrievalMeta {
  return {
    source: "knowledge_base",
    attempted: true,
    configured: true,
    candidateFileCount: 0,
    selectedFiles: [],
    contentRetrieved: false,
    usefulContextEmpty: true,
    textCharCount: 0,
    ...partial,
  };
}

describe("AI-01 requestId", () => {
  it("creates unique request ids", () => {
    const a = createAiRequestId();
    const b = createAiRequestId();
    assert.notEqual(a, b);
    assert.match(a, /^[0-9a-f-]{36}$/i);
  });

  it("returns requestId from runWorkspaceAi empty path", async () => {
    const result = await runWorkspaceAi("");
    assert.ok(result.requestId);
    assert.match(result.requestId, /^[0-9a-f-]{36}$/i);
    assert.equal(result.demo, true);
  });
});

describe("AI-01 KB grounding decisions", () => {
  it("allows model when KB_CONTENT_AVAILABLE", () => {
    const intent = detectWorkspaceIntent(
      "сравни требования digital nomad программы",
    );
    assert.equal(intent.needsKb, true);
    const decision = decideKbGrounding({
      intent,
      kbMeta: kbMeta({
        groundingState: "KB_CONTENT_AVAILABLE",
        mode: "full_export",
        contentRetrieved: true,
        usefulContextEmpty: false,
        selectedFiles: [
          { id: "f1", path: "dn.pdf", score: 4, hasContent: true },
        ],
      }),
    });
    assert.equal(decision.blockModel, false);
    assert.equal(decision.reason, "NONE");
  });

  it("blocks confident answer on KB_EMPTY", () => {
    const intent = detectWorkspaceIntent(
      "требования digital nomad immigration",
    );
    const decision = decideKbGrounding({
      intent,
      kbMeta: kbMeta({
        groundingState: "KB_EMPTY",
        mode: "full_export",
        usefulContextEmpty: true,
      }),
    });
    assert.equal(decision.blockModel, true);
    assert.equal(decision.reason, "KB_EMPTY");
    assert.equal(decision.reply, KB_SAFE_GROUNDING_REPLY);
  });

  it("blocks confident answer on KB_ERROR", () => {
    const intent = detectWorkspaceIntent("база знаний immigration программа");
    const decision = decideKbGrounding({
      intent,
      kbMeta: kbMeta({
        groundingState: "KB_ERROR",
        mode: "failed",
        errorMessage: "boom",
      }),
    });
    assert.equal(decision.blockModel, true);
    assert.equal(decision.reason, "KB_RETRIEVAL_ERROR");
    assert.ok(decision.reply?.includes("базе знаний"));
  });

  it("blocks catalog-only when content is required", () => {
    const intent = detectWorkspaceIntent(
      "сравни требования digital nomad программы",
    );
    assert.equal(intent.needsKbFullText, true);
    const decision = decideKbGrounding({
      intent,
      kbMeta: kbMeta({
        groundingState: "KB_CATALOG_ONLY",
        mode: "catalog",
        selectedFiles: [
          { id: "f1", path: "list.pdf", score: 2, hasContent: false },
        ],
      }),
    });
    assert.equal(decision.blockModel, true);
    assert.equal(decision.reason, "KB_CATALOG_ONLY_CONTENT_REQUIRED");
  });

  it("does not block non-KB writing requests", () => {
    const intent = detectWorkspaceIntent(
      "Напиши тёплое письмо клиенту с благодарностью",
    );
    assert.equal(intent.needsKb, false);
    const decision = decideKbGrounding({
      intent,
      kbMeta: kbMeta({
        groundingState: "KB_SKIPPED",
        mode: "skipped",
        attempted: false,
      }),
    });
    assert.equal(decision.blockModel, false);
  });

  it("does not block client structured-data requests", () => {
    const intent = detectWorkspaceIntent(
      "Какой номер паспорта у клиента Белоус Екатерина?",
    );
    assert.equal(intent.needsKb, false);
    const decision = decideKbGrounding({
      intent,
      kbMeta: kbMeta({
        groundingState: "KB_SKIPPED",
        mode: "skipped",
        attempted: false,
      }),
    });
    assert.equal(decision.blockModel, false);
  });

  it("allows catalog-only when content is not required", () => {
    const intent = detectWorkspaceIntent("покажи базу знаний knowledge");
    assert.equal(intent.needsKb, true);
    assert.equal(intent.needsKbFullText, false);
    const decision = decideKbGrounding({
      intent,
      kbMeta: kbMeta({
        groundingState: "KB_CATALOG_ONLY",
        mode: "catalog",
        selectedFiles: [
          { id: "f1", path: "guide.pdf", score: 1, hasContent: false },
        ],
      }),
    });
    assert.equal(decision.blockModel, false);
  });
});

describe("AI-01 trace serialization", () => {
  it("records intent flags and KB state distinctions", () => {
    const trace = createEmptyWorkspaceAiTrace(createAiRequestId());
    const intent = detectWorkspaceIntent(
      "требования digital nomad программы",
    );
    trace.intent = intent;
    trace.needsKb = intent.needsKb;
    trace.needsKbFullText = intent.needsKbFullText;
    trace.kbGroundingState = "KB_CATALOG_ONLY";
    trace.kbMode = "catalog";
    trace.fallbackReason = "KB_CATALOG_ONLY_CONTENT_REQUIRED";
    trace.fallbackActivated = true;
    trace.requestedModel = "anthropic/claude-sonnet-4";
    trace.returnedModel = "NOT_AVAILABLE";

    const serialized = serializeWorkspaceAiTraceForLog(trace);
    assert.equal(serialized.needsKb, true);
    assert.equal(serialized.kbGroundingState, "KB_CATALOG_ONLY");
    assert.equal(serialized.kbMode, "catalog");
    assert.equal(
      serialized.fallbackReason,
      "KB_CATALOG_ONLY_CONTENT_REQUIRED",
    );
    assert.ok(serialized.requestId);
    assert.ok(serialized.intent);
  });

  it("excludes configured API secrets from serialized trace", () => {
    const secret = "sk-or-v1-THIS_IS_A_FAKE_OPENROUTER_KEY_123456";
    const trace = createEmptyWorkspaceAiTrace(createAiRequestId());
    trace.notes.push("provider ready");
    const serialized = serializeWorkspaceAiTraceForLog(trace);
    assert.equal(
      assertTraceHasNoSecrets(serialized, [secret, "OPENROUTER_API_KEY"]),
      true,
    );
    const blob = JSON.stringify(serialized).toLowerCase();
    assert.equal(blob.includes("authorization"), false);
    assert.equal(blob.includes("bearer "), false);
    assert.equal(blob.includes(secret.toLowerCase()), false);
  });

  it("marks OpenRouter failure with explicit reason code", () => {
    const trace = createEmptyWorkspaceAiTrace(createAiRequestId());
    trace.fallbackActivated = true;
    trace.fallbackReason = "OPENROUTER_ERROR";
    trace.openRouterOk = false;
    const serialized = serializeWorkspaceAiTraceForLog(trace);
    assert.equal(serialized.fallbackReason, "OPENROUTER_ERROR");
    assert.equal(serialized.openRouterOk, false);
  });
});
