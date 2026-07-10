import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client } from "@/lib/google-sheets/types";
import {
  EMPTY_CLIENT_SEARCH_INTENT,
  parseClientSearchIntentRules,
} from "./client-search-intent";
import { extractPhoneFromQuery } from "./client-search";

describe("parseClientSearchIntentRules submission dates", () => {
  it("detects january and february submission list query", () => {
    const query =
      "найди клиентов, заявки на которых мы подавали в январе и феврале";
    const intent = parseClientSearchIntentRules(query);

    assert.equal(intent.isListQuery, true);
    assert.deepEqual(intent.submittedMonths, [1, 2]);
    assert.equal(intent.phone, null);
    assert.equal(intent.passport, null);
  });

  it("detects submission month with year", () => {
    const intent = parseClientSearchIntentRules(
      "покажи клиентов с датой подачи в феврале 2026",
    );
    assert.deepEqual(intent.submittedMonths, [2]);
    assert.equal(intent.submittedYear, 2026);
  });

  it("keeps booking month separate from submission", () => {
    const intent = parseClientSearchIntentRules(
      "у кого букинг заканчивается в июне 2026",
    );
    assert.equal(intent.bookingMonth, 6);
    assert.equal(intent.bookingYear, 2026);
    assert.deepEqual(intent.submittedMonths, []);
  });
});

describe("extractPhoneFromQuery date safety", () => {
  it("does not treat calendar date as phone", () => {
    assert.equal(
      extractPhoneFromQuery("клиент с датой подачи 01.02.2026"),
      null,
    );
  });

  it("still extracts phone when explicitly mentioned", () => {
    assert.equal(
      extractPhoneFromQuery("телефон +7 999 123 45 67"),
      "79991234567",
    );
  });
});

describe("crmClientMatchesSearchIntent", () => {
  it("matches january and february submission dates", async () => {
    const { crmClientMatchesSearchIntent } = await import(
      "./structured-client-search"
    );
    const intent = {
      ...EMPTY_CLIENT_SEARCH_INTENT,
      submittedMonths: [1, 2],
      submittedYear: 2026,
      isListQuery: true,
    };
    const janClient: Client = {
      id: "P1",
      name: "Иванова",
      phone: "—",
      email: "—",
      country: "Хорватия",
      citizenship: "—",
      direction: "Хорватия",
      status: "—",
      manager: "—",
      lastActivity: "—",
      createdAt: "10.01.2026",
      submittedAt: "10.01.2026",
      rowIndex: 2,
    };
    const febClient: Client = {
      ...janClient,
      id: "P2",
      name: "Петрова",
      submittedAt: "01.02.2026",
      createdAt: "01.02.2026",
      rowIndex: 3,
    };
    const marClient: Client = {
      ...janClient,
      id: "P3",
      name: "Сидорова",
      submittedAt: "05.03.2026",
      createdAt: "05.03.2026",
      rowIndex: 4,
    };

    assert.equal(crmClientMatchesSearchIntent(janClient, intent), true);
    assert.equal(crmClientMatchesSearchIntent(febClient, intent), true);
    assert.equal(crmClientMatchesSearchIntent(marClient, intent), false);
  });
});
