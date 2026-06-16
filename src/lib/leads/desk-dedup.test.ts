import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkLeadAgainstDesk,
  deskFullNameMatches,
} from "@/lib/leads/desk-dedup";
import type { EmigrantDeskClient } from "@/lib/emigrant-desk/types";

function desk(partial: Partial<EmigrantDeskClient>): EmigrantDeskClient {
  return {
    id: "desk-1",
    firstName: null,
    lastName: null,
    email: "",
    currentStatus: null,
    caseNumber: null,
    consulate: null,
    submissionCity: null,
    submissionDate: null,
    statusUpdatedAt: null,
    internalComment: null,
    ...partial,
  };
}

describe("checkLeadAgainstDesk", () => {
  it("marks case_number match as STRONG duplicate", () => {
    const check = checkLeadAgainstDesk(
      {
        name: "Белоногова Мария Павловна",
        passport: "777063956",
        email: "other@example.com",
      },
      desk({
        lastName: "Белоногова",
        firstName: "Мария",
        caseNumber: "777063956",
        email: "berchukvl@gmail.com",
      }),
    );

    assert.equal(check.isStrongDuplicate, true);
    assert.ok(check.strongReasons.includes("desk_case_number"));
    assert.equal(check.isMediumDuplicate, false);
  });

  it("marks email match as STRONG duplicate", () => {
    const check = checkLeadAgainstDesk(
      {
        name: "Бякова Мария Николаевна",
        passport: "111111111",
        email: "annushka_80@inbox.ru",
      },
      desk({
        lastName: "Бякова",
        firstName: "Мария",
        caseNumber: "760724050",
        email: "annushka_80@inbox.ru",
      }),
    );

    assert.equal(check.isStrongDuplicate, true);
    assert.ok(check.strongReasons.includes("desk_email"));
  });

  it("marks name-only match as MEDIUM duplicate", () => {
    const check = checkLeadAgainstDesk(
      {
        name: "Иванов Иван Иванович",
        passport: "999999999",
        email: "new@example.com",
      },
      desk({
        lastName: "Иванов",
        firstName: "Иван",
        caseNumber: "111111111",
        email: "other@example.com",
      }),
    );

    assert.equal(check.isStrongDuplicate, false);
    assert.equal(check.isMediumDuplicate, true);
    assert.ok(check.mediumReasons.includes("desk_name"));
  });

  it("returns no match for unrelated client", () => {
    const check = checkLeadAgainstDesk(
      {
        name: "Кулешова Леонелла Евгеньевна",
        passport: "776511478",
        email: "leonella0123401@gmail.com",
      },
      desk({
        lastName: "Петров",
        firstName: "Пётр",
        caseNumber: "123456789",
        email: "petrov@example.com",
      }),
    );

    assert.equal(check.isStrongDuplicate, false);
    assert.equal(check.isMediumDuplicate, false);
  });
});

describe("deskFullNameMatches", () => {
  it("matches surname and first name regardless of patronymic", () => {
    assert.equal(
      deskFullNameMatches(
        "Тайк Филипп Майерович",
        desk({ lastName: "Тайк", firstName: "Филипп" }),
      ),
      true,
    );
  });
});
