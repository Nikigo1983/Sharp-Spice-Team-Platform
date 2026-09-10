import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCaseMemoryForPrompt,
  mergeCaseMemoryFromClientSnapshot,
  parseCaseMemoryFromModelText,
  sanitizeCaseMemory,
  shouldRefreshCaseMemory,
  WORKSPACE_CASE_MEMORY_EVERY_TURNS,
} from "@/lib/ai/workspace-case-memory";

describe("workspace case memory", () => {
  it("sanitizes and drops empty payloads", () => {
    assert.equal(sanitizeCaseMemory(null), null);
    assert.equal(sanitizeCaseMemory({ clientName: "  " }), null);
    const ok = sanitizeCaseMemory({
      clientName: "Иван Иванов",
      citizenship: "РФ",
      appPassword: "secret",
    });
    assert.equal(ok?.clientName, "Иван Иванов");
    assert.equal(ok?.citizenship, "РФ");
    assert.equal(
      ok && "appPassword" in ok,
      false,
    );
  });

  it("merges CRM snapshot without wiping dialogue facts", () => {
    const merged = mergeCaseMemoryFromClientSnapshot(
      {
        clientName: "Иван",
        citizenship: null,
        passport: "AA123",
        applicationPlace: "Подгорица",
        priorResidency: "не было",
        employers: null,
        dates: null,
        specialNotes: "Не указывать прежний адрес",
        openQuestions: null,
        linkedClientId: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "client-1",
        name: "Иван Иванов",
        citizenship: "РФ",
        passportNumber: "BB999",
        direction: "Хорватия",
      },
    );
    assert.equal(merged?.clientName, "Иван");
    assert.equal(merged?.citizenship, "РФ");
    assert.equal(merged?.passport, "AA123");
    assert.equal(merged?.applicationPlace, "Подгорица");
    assert.equal(merged?.priorResidency, "не было");
    assert.equal(merged?.specialNotes, "Не указывать прежний адрес");
    assert.equal(merged?.linkedClientId, "client-1");
  });

  it("parses JSON from model output", () => {
    const parsed = parseCaseMemoryFromModelText(`
Here you go:
\`\`\`json
{"clientName":"Анна","citizenship":"РФ","passport":null}
\`\`\`
`);
    assert.equal(parsed?.clientName, "Анна");
    assert.equal(parsed?.citizenship, "РФ");
    assert.equal(parsed?.passport, null);
  });

  it("formats prompt block and refreshes on cadence", () => {
    const block = formatCaseMemoryForPrompt({
      clientName: "Иван",
      citizenship: "РФ",
      passport: null,
      applicationPlace: "Подгорица",
      priorResidency: null,
      employers: null,
      dates: null,
      specialNotes: null,
      openQuestions: null,
      linkedClientId: null,
      updatedAt: new Date().toISOString(),
    });
    assert.match(block, /ПАМЯТЬ КЕЙСА/);
    assert.match(block, /Иван/);
    assert.equal(shouldRefreshCaseMemory(1, 0), false);
    assert.equal(shouldRefreshCaseMemory(WORKSPACE_CASE_MEMORY_EVERY_TURNS, 0), true);
  });
});
