/**
 * Phase 0 — follow-up generation failure CLASS (no production PII).
 * Distinguishes technical AI failures from CLIENT_NOT_FOUND after retrieval.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatDebtReminderLetter,
  isClientDebtReminderLetterQuery,
} from "@/lib/ai/client-debt-letter";
import {
  aiErrorMessage,
  aiErrorPayload,
  classifyAiFailure,
  normalizeAiErrorCode,
  providerHttpErrorCode,
} from "@/lib/ai/errors";
import {
  createEmptyWorkspaceAiTrace,
  markTraceProviderResult,
  serializeWorkspaceAiTraceForLog,
  assertTraceHasNoSecrets,
} from "@/lib/ai/workspace-trace";

const FOLLOW_UP_LETTER =
  "Напиши клиенту деликатное письмо о необходимости оплатить оставшуюся сумму.";

describe("Phase 0 follow-up generation failure class", () => {
  it("A: synthetic grounded draft succeeds without inventing amounts", () => {
    assert.equal(isClientDebtReminderLetterQuery(FOLLOW_UP_LETTER), true);
    const letter = formatDebtReminderLetter({
      displayName: "Тестова Анна",
      email: "anna.test@example.com",
      contractAmount: "2 000 €",
      contractAmountCents: 200_000,
      paidAmount: "1 000 €",
      balance: "1 000 €",
      balanceCents: 100_000,
      nameHint: "Тестова",
      mentionResidencePermit: true,
    });
    assert.match(letter, /1 000 €/);
    assert.match(letter, /anna\.test@example\.com/);
    assert.doesNotMatch(letter, /не найден/i);
  });

  it("B: provider 5xx maps to MODEL_PROVIDER_ERROR, not CLIENT_NOT_FOUND", () => {
    const code = providerHttpErrorCode("openrouter", 502);
    assert.equal(code, "MODEL_PROVIDER_ERROR");
    assert.equal(classifyAiFailure(code), "MODEL_PROVIDER_ERROR");
    const msg = aiErrorMessage(code);
    assert.match(msg, /Сервис AI/i);
    assert.doesNotMatch(msg, /не найден/i);
    assert.doesNotMatch(msg, /не заполнено/i);
  });

  it("C: timeout maps to MODEL_TIMEOUT", () => {
    const payload = aiErrorPayload("AI_TIMEOUT");
    assert.equal(payload.failureClass, "MODEL_TIMEOUT");
    assert.match(payload.message, /ожидания/i);
    assert.doesNotMatch(payload.message, /не найден/i);
  });

  it("D: empty completion maps to EMPTY_MODEL_RESPONSE", () => {
    const payload = aiErrorPayload("MODEL_EMPTY_RESPONSE");
    assert.equal(payload.code, "EMPTY_MODEL_RESPONSE");
    assert.equal(payload.failureClass, "EMPTY_MODEL_RESPONSE");
    assert.match(payload.message, /пустой ответ/i);
    assert.match(payload.message, /технический сбой/i);
    assert.doesNotMatch(payload.message, /не найден/i);
  });

  it("E: interrupted stream maps to STREAM_INTERRUPTED", () => {
    const payload = aiErrorPayload("MODEL_STREAM_INTERRUPTED");
    assert.equal(payload.failureClass, "STREAM_INTERRUPTED");
    assert.match(payload.message, /не полностью/i);
    assert.doesNotMatch(payload.message, /не найден/i);
  });

  it("rate limit and SOURCE_UNAVAILABLE stay distinct from not-found", () => {
    assert.equal(
      classifyAiFailure(providerHttpErrorCode("openrouter", 429)),
      "MODEL_RATE_LIMIT",
    );
    const source = aiErrorPayload("SOURCE_UNAVAILABLE");
    assert.equal(source.failureClass, "SOURCE_UNAVAILABLE");
    assert.match(source.message, /временно недоступен/i);
    assert.doesNotMatch(source.message, /не найден/i);
  });

  it("trace provider outcome stays privacy-safe", () => {
    const trace = createEmptyWorkspaceAiTrace("00000000-0000-4000-8000-000000000099");
    trace.requestClass = "FOLLOW_UP_GENERATION";
    trace.astraCalled = true;
    markTraceProviderResult(trace, {
      ok: false,
      errorCode: "EMPTY_MODEL_RESPONSE",
    });
    assert.equal(trace.failureClass, "EMPTY_MODEL_RESPONSE");
    assert.equal(trace.providerOutcome, "EMPTY");
    const serialized = serializeWorkspaceAiTraceForLog(trace);
    assert.equal(serialized.failureClass, "EMPTY_MODEL_RESPONSE");
    assert.ok(
      assertTraceHasNoSecrets(serialized, [
        "anna.test@example.com",
        "Bearer sk-secret",
      ]),
    );
  });

  it("normalize keeps legacy HTTP codes classifiable", () => {
    assert.equal(
      normalizeAiErrorCode("OPENROUTER_HTTP_503"),
      "MODEL_PROVIDER_ERROR",
    );
    assert.equal(normalizeAiErrorCode("OPENROUTER_HTTP_429"), "MODEL_RATE_LIMIT");
  });
});
