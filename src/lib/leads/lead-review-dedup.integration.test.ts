import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientContext } from "@/lib/ai/client-context";
import { analyzeLeadDuplicates } from "@/lib/leads/lead-review-dedup";
import type { EmigrantDeskClient } from "@/lib/emigrant-desk/types";

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

function desk(partial: Partial<EmigrantDeskClient>): EmigrantDeskClient {
  return {
    id: partial.id ?? "desk-uuid",
    firstName: null,
    lastName: null,
    email: "",
    currentStatus: "В работе",
    caseNumber: null,
    consulate: null,
    submissionCity: null,
    submissionDate: null,
    statusUpdatedAt: null,
    internalComment: null,
    ...partial,
  };
}

describe("analyzeLeadDuplicates desk integration", () => {
  it("adds Desk STRONG match as informational hint when case_number equals passport", () => {
    const lead = ctx({
      source: "new_clients",
      name: "Белоногова Мария Павловна",
      rowIndex: 7,
      email: "mary.belonogova.143@gmail.com",
    });

    const analysis = analyzeLeadDuplicates(
      lead,
      [],
      [],
      [
        desk({
          id: "desk-belonogova",
          lastName: "Белоногова",
          firstName: "Мария",
          caseNumber: "777063956",
          email: "berchukvl@gmail.com",
        }),
      ],
      {
        name: "Белоногова Мария Павловна",
        passport: "777063956",
        email: "mary.belonogova.143@gmail.com",
      },
    );

    assert.equal(analysis.hasBlockingStrongMatch, false);
    assert.equal(analysis.hasDeskHint, true);
    assert.equal(analysis.deskStrongMatches.length, 1);
    assert.equal(analysis.deskStrongMatches[0].source, "desk");
    assert.ok(analysis.deskStrongMatches[0].reasons.includes("Desk case_number"));
    assert.equal(analysis.blockingStrongMatches.length, 0);
  });

  it("keeps CRM blocking and Desk informational separate", () => {
    const lead = ctx({
      source: "new_clients",
      name: "Давлятова Лола Бахтиёровна",
      rowIndex: 3,
      debugRow: { passport: "762762123" },
    });
    const crm = ctx({
      source: "clients",
      name: "Давлятова Лола",
      debugRow: { passport: "762762123" },
    });

    const analysis = analyzeLeadDuplicates(
      lead,
      [crm],
      [],
      [
        desk({
          lastName: "Давлятова",
          firstName: "Лола",
          caseNumber: "762762123",
        }),
      ],
      {
        name: "Давлятова Лола Бахтиёровна",
        passport: "762762123",
        email: "",
      },
    );

    assert.equal(analysis.hasBlockingStrongMatch, true);
    assert.equal(analysis.blockingStrongMatches.length, 1);
    assert.equal(analysis.blockingStrongMatches[0].source, "crm");
    assert.equal(analysis.deskStrongMatches.length, 1);
    assert.equal(analysis.hasDeskHint, true);
  });

  it("adds Desk MEDIUM match as informational hint for name-only overlap", () => {
    const lead = ctx({
      source: "new_clients",
      name: "Иванов Иван Иванович",
      rowIndex: 12,
      email: "ivan.new@example.com",
    });

    const analysis = analyzeLeadDuplicates(
      lead,
      [],
      [],
      [
        desk({
          lastName: "Иванов",
          firstName: "Иван",
          caseNumber: "100000001",
          email: "ivan.desk@example.com",
        }),
      ],
      {
        name: "Иванов Иван Иванович",
        passport: "999999999",
        email: "ivan.new@example.com",
      },
    );

    assert.equal(analysis.hasBlockingStrongMatch, false);
    assert.equal(analysis.hasDeskHint, true);
    assert.equal(analysis.deskMediumMatches.length, 1);
    assert.equal(analysis.deskMediumMatches[0].source, "desk");
    assert.ok(analysis.deskMediumMatches[0].reasons.includes("Desk ФИО"));
  });

  it("classifies clean lead as LOW risk (no blocking or desk hints)", () => {
    const lead = ctx({
      source: "new_clients",
      name: "Кулешова Леонелла Евгеньевна",
      rowIndex: 10,
      email: "leonella0123401@gmail.com",
    });

    const analysis = analyzeLeadDuplicates(
      lead,
      [],
      [],
      [
        desk({
          lastName: "Петров",
          firstName: "Пётр",
          caseNumber: "123456789",
          email: "petrov@example.com",
        }),
      ],
      {
        name: "Кулешова Леонелла Евгеньевна",
        passport: "776511478",
        email: "leonella0123401@gmail.com",
      },
    );

    assert.equal(analysis.hasBlockingStrongMatch, false);
    assert.equal(analysis.hasDeskHint, false);
    assert.equal(analysis.hasPossibleMatch, false);
  });
});
