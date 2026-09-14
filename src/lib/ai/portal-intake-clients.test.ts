import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  answerCitizenshipFromAnswers,
  answerContractFromAnswers,
  answerLatinNameFromAnswers,
} from "@/lib/ai/portal-intake-fields";

const byakovaAnswers = {
  __legacyImport: { source: "croatia_external" },
  __legacyIdentity: {
    fullNameCyrillic: "Бякова",
    fullNameLatin: "Byakova Maria",
    passportNumber: "760724050",
    email: "annushka_80@inbox.ru",
    submittedAt: "16.06.2026",
    status: "",
    direction: "Хорватия",
  },
  __legacySheet: {
    Фамилия: "Бякова",
    Латиница: "Byakova Maria",
    "Номер паспорта": "760724050",
    Договор: "Flant JSC",
    "Партнер от кого клиент": "ЛЕНА МОСКВА",
  },
  __staff: {
    contractNumber: "",
    contractAmount: "",
    company: "",
    curator: "",
    expectedApproval: "",
    bookingAddress: "Gundulićeva 21",
    bookingDate: "16.10-23.10",
    trpApprovalDate: "",
    trpCardIssueDate: "",
    partner: "ЛЕНА МОСКВА",
  },
  full_name_latin: "Byakova Maria",
};

describe("portal intake field mapping", () => {
  it("reads Договор from legacy sheet when staff contract fields are empty", () => {
    assert.equal(answerContractFromAnswers(byakovaAnswers), "Flant JSC");
  });

  it("keeps Латиница as latin FIO, not citizenship", () => {
    assert.equal(answerLatinNameFromAnswers(byakovaAnswers), "Byakova Maria");
    assert.equal(answerCitizenshipFromAnswers(byakovaAnswers), "");
  });

  it("ignores citizenship_latin when it duplicates latin FIO", () => {
    assert.equal(
      answerCitizenshipFromAnswers({
        ...byakovaAnswers,
        citizenship_latin: "Byakova Maria",
      }),
      "",
    );
  });
});
