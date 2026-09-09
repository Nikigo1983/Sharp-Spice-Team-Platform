import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateInRange, matchesApprovalFilter, matchesPresenceFilter } from "@/lib/clients/list-filter-utils";
import { findFormgridFilterColumns } from "@/lib/clients/formgrid-filter-columns";
import { clientMatchesFilters } from "@/lib/google-sheets/parse";
import type { Client } from "@/lib/google-sheets/types";

function sampleClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "1",
    name: "Иванов",
    phone: "",
    email: "a@b.c",
    country: "Хорватия",
    citizenship: "",
    direction: "Хорватия",
    status: "В работе",
    manager: "Лена",
    lastActivity: "",
    createdAt: "2024-01-01",
    submittedAt: "15.03.2024",
    referentName: "Петрова",
    partnerName: "Шарипа",
    contract: "Договор-1",
    approvalAt: "20.04.2024",
    ...overrides,
  };
}

describe("client list filters", () => {
  it("filters by referent, partner, contract", () => {
    const client = sampleClient();
    assert.equal(
      clientMatchesFilters(client, { referent: "Петрова", partner: "Шарипа" }),
      true,
    );
    assert.equal(clientMatchesFilters(client, { referent: "Другая" }), false);
    assert.equal(clientMatchesFilters(client, { contract: "Договор-1" }), true);
    assert.equal(clientMatchesFilters(client, { contract: "Другой" }), false);
  });

  it("filters by submission date range", () => {
    const client = sampleClient({ submittedAt: "15.03.2024" });
    assert.equal(
      clientMatchesFilters(client, {
        submittedFrom: "2024-03-01",
        submittedTo: "2024-03-31",
      }),
      true,
    );
    assert.equal(
      clientMatchesFilters(client, { submittedFrom: "2024-04-01" }),
      false,
    );
  });

  it("filters approval and contract presence", () => {
    const approved = sampleClient({ approvalAt: "01.01.2024", contract: "X" });
    const pending = sampleClient({ approvalAt: "", contract: "" });
    assert.equal(
      clientMatchesFilters(approved, { approvalStatus: "approved" }),
      true,
    );
    assert.equal(
      clientMatchesFilters(pending, { approvalStatus: "not_approved" }),
      true,
    );
    assert.equal(clientMatchesFilters(approved, { hasContract: "yes" }), true);
    assert.equal(clientMatchesFilters(pending, { hasContract: "no" }), true);
  });
});

describe("list-filter-utils", () => {
  it("dateInRange and presence helpers", () => {
    assert.equal(dateInRange("2024-03-15", "2024-03-01", "2024-03-31"), true);
    assert.equal(dateInRange(null, "2024-03-01"), false);
    assert.equal(matchesPresenceFilter("100€", "yes"), true);
    assert.equal(matchesPresenceFilter("", "no"), true);
    assert.equal(matchesApprovalFilter("01.01.2024", "approved"), true);
    assert.equal(matchesApprovalFilter("", "not_approved"), true);
  });
});

describe("formgrid filter columns", () => {
  it("detects partner/referent/contract headers", () => {
    const cols = findFormgridFilterColumns([
      "Date",
      "ФИО",
      "Партнёр",
      "Референт",
      "Договор",
      "Сумма",
      "Дата одобрения ВНЖ",
    ]);
    assert.equal(cols.submitted, 0);
    assert.equal(cols.partner, 2);
    assert.equal(cols.referent, 3);
    assert.equal(cols.contract, 4);
    assert.equal(cols.amount, 5);
    assert.equal(cols.approval, 6);
  });
});
