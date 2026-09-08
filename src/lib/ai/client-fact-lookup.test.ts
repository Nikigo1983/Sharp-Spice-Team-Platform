import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientNameMatchesQueryToken,
  detectRequestedClientFactField,
  formatStructuredClientFactReply,
  readClientFactFromClientRecord,
  readClientFactFromCrmContext,
} from "@/lib/ai/client-fact-lookup";
import type { ClientContext } from "@/lib/ai/client-context";
import { crmClientToContext, formatClientContextBlock } from "@/lib/ai/client-context";
import { routeWorkspaceQueryByRules } from "@/lib/ai/workspace-router-rules";
import { parseCroatiaExternalClientsRows } from "@/lib/google-sheets/parse";
import { getClientSheetFields } from "@/lib/google-sheets/client-detail-fields";
import type { Client } from "@/lib/google-sheets/types";

const HEADERS = [
  "Фамилия",
  "Латиница",
  "Номер паспорта",
  "электронная почта",
  "Дата подачи",
  "Дата предпологаемого одобрения",
  "Имя референта",
  "Адрес букинга",
  "Дата букинга (от и до)",
  "Дата одобрения ВНЖ",
  "Заметки",
  "Дата выдачи карточки ВНЖ",
  "Пароль для приложения",
  "Партнер от кого клиент",
  "Договор",
];

function antonovaClient(overrides: Partial<Client> = {}): Client {
  const [parsed] = parseCroatiaExternalClientsRows([
    HEADERS,
    [
      "АНТОНОВА",
      "Antonova Natalia",
      "763349009",
      "antonova_ns@mail.ru",
      "01.01.2025",
      "",
      "",
      "Vranyczanyeva 4",
      "11.08–18.08",
      "",
      "",
      "",
      "SECRET_APP_PASSWORD",
      "",
      "",
    ],
  ]);
  return { ...parsed, ...overrides };
}

function crmCtx(client: Client): ClientContext {
  return crmClientToContext(client, 90, ["адрес букинга"]);
}

describe("production booking address bug — routing name signal", () => {
  it("routes «У клиента Антоновой какой адрес букинга» to clients", () => {
    const q = "У клиента Антоновой какой адрес букинга";
    const r = routeWorkspaceQueryByRules(q);
    assert.ok(r.decision.sources.includes("clients"), JSON.stringify(r.decision));
    assert.equal(r.decision.workspaceIntent.fastClientLookup, true);
    assert.equal(r.decision.workspaceIntent.needsClients, true);
  });

  it("routes booking address variants to clients", () => {
    for (const q of [
      "Какой адрес букинга у Антоновой?",
      "Адрес букинга Антоновой",
      "Где букинг у Антоновой?",
      "Какой booking address у Антоновой?",
    ]) {
      const r = routeWorkspaceQueryByRules(q);
      assert.ok(
        r.decision.sources.includes("clients"),
        `${q} → ${JSON.stringify(r.decision.sources)}`,
      );
    }
  });
});

describe("production booking address bug — structured fact lookup", () => {
  it("returns Vranyczanyeva 4 for Antonova booking address questions", () => {
    const client = antonovaClient();
    const ctx = crmCtx(client);
    for (const q of [
      "У клиента Антоновой какой адрес букинга",
      "Какой адрес букинга у Антоновой?",
      "Какой booking address у Антоновой?",
    ]) {
      assert.equal(detectRequestedClientFactField(q), "bookingAddress");
      const fact = readClientFactFromCrmContext(ctx, "bookingAddress");
      assert.equal(fact.present, true);
      assert.equal(fact.value, "Vranyczanyeva 4");
      const reply = formatStructuredClientFactReply({
        clientName: client.name,
        fieldId: "bookingAddress",
        value: fact.value,
        present: fact.present,
        rowIndex: client.rowIndex,
      });
      assert.match(reply, /Vranyczanyeva 4/);
    }
  });

  it("does not invent address when bookingAddress empty", () => {
    const client = antonovaClient({ bookingAddress: "—" });
    const fact = readClientFactFromClientRecord(client, "bookingAddress");
    assert.equal(fact.present, false);
    const reply = formatStructuredClientFactReply({
      clientName: client.name,
      fieldId: "bookingAddress",
      value: fact.value,
      present: fact.present,
    });
    assert.doesNotMatch(reply, /Vranyczanyeva/);
    assert.match(reply, /пустое|не заполнено/i);
  });

  it("matches genitive Антоновой to АНТОНОВА", () => {
    assert.equal(clientNameMatchesQueryToken("АНТОНОВА", "Антоновой"), true);
    assert.equal(clientNameMatchesQueryToken("АНТОНОВА", "Петровой"), false);
  });

  it("UI and AI share the same bookingAddress canonical field", () => {
    const client = antonovaClient();
    const ui = getClientSheetFields(client).find(
      (f) => f.label === "Адрес букинга",
    );
    assert.equal(ui?.value, "Vranyczanyeva 4");
    const aiBlock = formatClientContextBlock(crmCtx(client));
    assert.match(aiBlock, /Vranyczanyeva 4/);
    const fact = readClientFactFromCrmContext(crmCtx(client), "bookingAddress");
    assert.equal(fact.value, ui?.value);
  });

  it("never exposes app password via fact detection", () => {
    assert.equal(
      detectRequestedClientFactField("Какой пароль для приложения у Антоновой?"),
      null,
    );
    assert.equal(
      detectRequestedClientFactField("What is the app password for Antonova?"),
      null,
    );
  });
});

describe("client fact field coverage matrix (schema-based)", () => {
  const client = antonovaClient({
    notes: "Ждёт карту",
    status: "documents review",
    partnerName: "Test Partner",
  });

  const cases: Array<{ q: string; field: string; expect: string }> = [
    { q: "паспорт Антоновой", field: "passport", expect: "763349009" },
    { q: "email Антоновой", field: "email", expect: "antonova_ns@mail.ru" },
    {
      q: "адрес букинга Антоновой",
      field: "bookingAddress",
      expect: "Vranyczanyeva 4",
    },
    {
      q: "даты букинга у Антоновой",
      field: "bookingRange",
      expect: "11.08–18.08",
    },
    { q: "дата подачи Антоновой", field: "submittedAt", expect: "01.01.2025" },
    { q: "статус Антоновой", field: "status", expect: "documents review" },
    { q: "заметки Антоновой", field: "notes", expect: "Ждёт карту" },
    {
      q: "What is Antonova booking address?",
      field: "bookingAddress",
      expect: "Vranyczanyeva 4",
    },
  ];

  for (const entry of cases) {
    it(`${entry.field}: ${entry.q}`, () => {
      assert.equal(detectRequestedClientFactField(entry.q), entry.field);
      const fact = readClientFactFromClientRecord(
        client,
        entry.field as "bookingAddress",
      );
      assert.equal(fact.present, true);
      assert.equal(fact.value, entry.expect);
    });
  }
});
