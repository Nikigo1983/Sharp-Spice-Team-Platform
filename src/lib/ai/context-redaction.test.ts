import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientContext } from "@/lib/ai/client-context";
import {
  containsSensitiveMarkers,
  isSensitiveFieldKey,
  redactDebugRow,
  redactForLogging,
  redactSensitiveText,
  sanitizeChatMessagesForProvider,
  sanitizeClientContextForTransport,
  sanitizeWorkspaceChatTurns,
} from "@/lib/ai/context-redaction";

function makeContext(
  partial: Partial<ClientContext> & Pick<ClientContext, "source" | "name">,
): ClientContext {
  return {
    sourceLabel: partial.source === "clients" ? "Клиенты" : "Новые клиенты",
    phone: "",
    email: "",
    country: "",
    direction: "",
    status: "",
    manager: "",
    lastActivity: "",
    surveyData: "",
    score: 0,
    matchedFields: [],
    debugRow: {},
    rowIndex: 1,
    ...partial,
  };
}

describe("isSensitiveFieldKey", () => {
  it("flags appPassword and password-like keys", () => {
    assert.equal(isSensitiveFieldKey("appPassword"), true);
    assert.equal(isSensitiveFieldKey("Пароль для приложения"), true);
    assert.equal(isSensitiveFieldKey("passport"), false);
    assert.equal(isSensitiveFieldKey("name"), false);
  });
});

describe("redactDebugRow", () => {
  it("removes sensitive keys from debug row", () => {
    const row = redactDebugRow({
      name: "Иванов",
      appPassword: "secret123",
      passport: "123456789",
      "Пароль для приложения": "abc",
    });
    assert.deepEqual(row, {
      name: "Иванов",
      passport: "123456789",
    });
  });
});

describe("sanitizeClientContextForTransport", () => {
  it("strips sensitive debug fields but keeps passport", () => {
    const sanitized = sanitizeClientContextForTransport(
      makeContext({
        source: "clients",
        name: "Иванов",
        debugRow: {
          passport: "123456789",
          appPassword: "hunter2",
        },
      }),
    );
    assert.equal(sanitized.debugRow.appPassword, undefined);
    assert.equal(sanitized.debugRow.passport, "123456789");
  });
});

describe("redactSensitiveText", () => {
  it("redacts JSON and inline password labels", () => {
    const text = redactSensitiveText(
      '{"appPassword": "secret"} | пароль для приложения: hunter2',
    );
    assert.match(text, /\[REDACTED\]/);
    assert.doesNotMatch(text, /secret|hunter2/);
  });
});

describe("sanitizeChatMessagesForProvider", () => {
  it("redacts sensitive markers in OpenRouter payload", () => {
    const messages = sanitizeChatMessagesForProvider([
      {
        role: "user",
        content: 'Raw row JSON:\n{"appPassword": "leak"}',
      },
    ]);
    assert.equal(containsSensitiveMarkers(messages[0].content), false);
    assert.match(messages[0].content, /\[REDACTED\]/);
  });
});

describe("sanitizeWorkspaceChatTurns", () => {
  it("redacts sensitive content before chat persistence", () => {
    const turns = sanitizeWorkspaceChatTurns([
      { role: "assistant", content: 'appPassword: "stored-leak"' },
    ]);
    assert.equal(containsSensitiveMarkers(turns[0].content), false);
  });
});

describe("redactForLogging", () => {
  it("redacts sensitive object keys in logs", () => {
    const logged = redactForLogging({
      query: "найди клиента",
      appPassword: "secret",
      nested: { accessToken: "abc" },
    }) as Record<string, unknown>;
    assert.equal(logged.appPassword, "[REDACTED]");
    assert.equal((logged.nested as Record<string, unknown>).accessToken, "[REDACTED]");
  });
});
