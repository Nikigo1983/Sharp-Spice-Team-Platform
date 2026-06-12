import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientContext, MergedClientContext } from "@/lib/ai/client-context";
import {
  buildManagerSourceSummary,
  formatMergedClientContextWithSources,
  resolveClientContextAttribution,
} from "@/lib/ai/client-field-sources";

function ctx(
  partial: Partial<ClientContext> & Pick<ClientContext, "source" | "name">,
): ClientContext {
  return {
    sourceLabel: partial.source === "clients" ? "Клиенты" : "Новые клиенты",
    rowIndex: partial.rowIndex ?? 1,
    phone: "",
    email: "",
    country: "",
    direction: "",
    status: "",
    manager: "",
    lastActivity: "",
    surveyData: "",
    score: 50,
    matchedFields: [],
    debugRow: {},
    ...partial,
  };
}

describe("resolveClientContextAttribution", () => {
  it("attributes contacts to Formgrid and status to CRM", () => {
    const crm = ctx({
      source: "clients",
      name: "Давлятова Лола",
      status: "В работе",
      debugRow: { passport: "762762123" },
    });
    const form = ctx({
      source: "new_clients",
      name: "Давлятова Лола Бахтиёровна",
      rowIndex: 5,
      email: "loladav1409@gmail.com",
      phone: "79099550114",
      debugRow: { passport: "762762123" },
    });

    const attribution = resolveClientContextAttribution([crm, form], {
      name: "Давлятова Лола Бахтиёровна",
      email: "loladav1409@gmail.com",
      caseNumber: "765946434",
      currentStatus: "Документы поданы",
      consulate: "",
      submissionCity: "",
      submissionDate: "",
      statusUpdatedAt: "",
      internalComment: "",
    });

    assert.deepEqual(attribution.activeSources, ["CRM", "Formgrid", "Emigrant Desk"]);
    assert.equal(
      attribution.fields.find((field) => field.label === "Email")?.source,
      "Formgrid",
    );
    assert.equal(
      attribution.fields.find((field) => field.label === "Статус")?.source,
      "CRM",
    );
    assert.equal(
      attribution.fields.find((field) => field.label === "Номер дела")?.value,
      "765946434",
    );
    assert.match(attribution.managerSummary, /CRM.*Formgrid/);
    assert.match(attribution.managerSummary, /Emigrant Desk/);
    assert.match(attribution.managerSummary, /анкеты Formgrid/);
  });

  it("detects phone conflicts between CRM and Formgrid", () => {
    const crm = ctx({
      source: "clients",
      name: "Иванов",
      phone: "79001112233",
    });
    const form = ctx({
      source: "new_clients",
      name: "Иванов Иван",
      phone: "79009998877",
    });

    const attribution = resolveClientContextAttribution([crm, form]);
    const phoneConflict = attribution.conflicts.find(
      (conflict) => conflict.field === "Телефон",
    );
    assert.ok(phoneConflict);
    assert.equal(phoneConflict?.values.length, 2);
  });
});

describe("formatMergedClientContextWithSources", () => {
  it("includes source checklist and field origins", () => {
    const merged: MergedClientContext = {
      source: "merged",
      sourceLabel: "Объединённый",
      rowIndex: 2,
      name: "Давлятова Лола Бахтиёровна",
      phone: "79099550114",
      email: "loladav1409@gmail.com",
      country: "",
      direction: "Хорватия",
      status: "В работе",
      manager: "",
      lastActivity: "",
      surveyData: "Formgrid row",
      crmData: "CRM row",
      score: 80,
      matchedFields: [],
      mergeReasons: ["passport"],
      parts: [
        ctx({
          source: "clients",
          name: "Давлятова Лола",
          status: "В работе",
        }),
        ctx({
          source: "new_clients",
          name: "Давлятова Лола Бахтиёровна",
          email: "loladav1409@gmail.com",
          phone: "79099550114",
        }),
      ],
      conflicts: [],
      debugRow: {},
    };

    const text = formatMergedClientContextWithSources(merged);
    assert.match(text, /✅ CRM/);
    assert.match(text, /✅ Formgrid/);
    assert.match(text, /Email:\nloladav1409@gmail.com\nИсточник: Formgrid/);
    assert.match(text, /Технические блоки по источникам/);
  });
});

describe("buildManagerSourceSummary", () => {
  it("formats two-source summary", () => {
    assert.equal(
      buildManagerSourceSummary(["CRM", "Formgrid"]),
      "Данные объединены из CRM и Formgrid.",
    );
  });
});
