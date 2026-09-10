import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientContext } from "@/lib/ai/client-context";
import {
  buildDocFillPack,
  detectDocFillDocumentLabel,
  formatDocFillReply,
  isDocFillIntent,
} from "@/lib/ai/workspace-doc-fill";

function crmClient(partial: Partial<ClientContext> & { name: string }): ClientContext {
  return {
    source: "clients",
    sourceLabel: "Клиенты",
    rowIndex: 2,
    name: partial.name,
    phone: partial.phone ?? "",
    email: partial.email ?? "",
    country: partial.country ?? "",
    direction: partial.direction ?? "Хорватия",
    status: partial.status ?? "В работе",
    manager: partial.manager ?? "",
    lastActivity: partial.lastActivity ?? "",
    surveyData: partial.surveyData ?? "",
    score: 1,
    matchedFields: [],
    debugRow: partial.debugRow ?? {},
  };
}

describe("workspace doc fill", () => {
  it("detects fill intent and skips checklist questions", () => {
    assert.equal(
      isDocFillIntent("Собери данные для заполнения заявления по Иванову"),
      true,
    );
    assert.equal(isDocFillIntent("Заполни анкету для Digital Nomad"), true);
    assert.equal(
      isDocFillIntent("Какие документы нужны для Digital Nomad в Хорватии?"),
      false,
    );
    assert.equal(detectDocFillDocumentLabel("заполни ВНЖ"), "ВНЖ / residence");
  });

  it("builds pack from CLIENT CONTEXT without inventing gaps", () => {
    const pack = buildDocFillPack({
      query: "Собери данные для заполнения заявления",
      client: crmClient({
        name: "Иван Иванов",
        email: "ivan@example.com",
        direction: "Хорватия",
        debugRow: {
          passport: "AA1234567",
          latinName: "Ivan Ivanov",
          bookingAddress: "Zagreb, Test 1",
        },
      }),
      caseMemory: {
        clientName: "Иван",
        citizenship: "РФ",
        passport: "SHOULD_NOT_WIN",
        applicationPlace: null,
        priorResidency: "не было",
        employers: null,
        dates: null,
        specialNotes: "Не указывать прежний адрес",
        openQuestions: null,
        linkedClientId: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const byId = Object.fromEntries(pack.fields.map((f) => [f.id, f]));
    assert.equal(byId.fullName?.value, "Иван Иванов");
    assert.equal(byId.fullName?.source, "таблица «Клиенты»");
    assert.equal(byId.passport?.value, "AA1234567");
    assert.equal(byId.passport?.source, "таблица «Клиенты»");
    assert.equal(byId.latinName?.value, "Ivan Ivanov");
    assert.equal(byId.citizenship?.value, "РФ");
    assert.equal(byId.citizenship?.source, "память кейса");
    assert.equal(byId.priorResidency?.value, "не было");
    assert.equal(byId.specialNotes?.value, "Не указывать прежний адрес");
    assert.equal(byId.employers?.value, null);

    const reply = formatDocFillReply(pack);
    assert.match(reply, /Иван Иванов/);
    assert.match(reply, /AA1234567/);
    assert.match(reply, /Обязательные пробелы|Желательно уточнить|Заполнено полей/);
    assert.doesNotMatch(reply, /SHOULD_NOT_WIN/);
  });

  it("asks for client when no context", () => {
    const pack = buildDocFillPack({
      query: "заполни заявление",
      client: null,
      caseMemory: null,
    });
    assert.equal(pack.clientName, null);
    assert.ok(pack.missingRequired.length >= 3);
  });
});
