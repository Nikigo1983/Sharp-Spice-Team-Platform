import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  answerCitizenshipFromAnswers,
  answerContractFromAnswers,
  answerLatinNameFromAnswers,
  answerPassportFromAnswers,
  buildPortalIntakeFieldCard,
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
    "электронная почта": "annushka_80@inbox.ru",
    "Дата подачи": "16.06.2026",
    "Дата предпологаемого одобрения": "15.10.2026 - 15.04.2028",
    "Адрес букинга": "Gundulićeva 21",
    "Дата букинга (от и до)": "16.10-23.10",
    Договор: "Flant JSC",
    "Партнер от кого клиент": "ЛЕНА МОСКВА",
    "ТИП ЗАНЯТОСТИ": "ФРИЛАНС",
  },
  __staff: {
    contractNumber: "",
    contractAmount: "",
    company: "",
    curator: "",
    expectedApproval: "15.10.2026 - 15.04.2028",
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

  it("reads passport from identity and sheet", () => {
    assert.equal(answerPassportFromAnswers(byakovaAnswers), "760724050");
    assert.equal(
      answerPassportFromAnswers({
        __legacySheet: { "Номер паспорта": "AA111" },
      }),
      "AA111",
    );
  });

  it("builds a field card with every questionnaire position", () => {
    const card = buildPortalIntakeFieldCard(byakovaAnswers);
    const byLabel = Object.fromEntries(card.map((row) => [row.label, row]));
    assert.equal(byLabel["Номер паспорта"]?.value, "760724050");
    assert.equal(byLabel["Номер паспорта"]?.empty, false);
    assert.equal(byLabel["Латиница"]?.value, "Byakova Maria");
    assert.equal(byLabel["Договор"]?.value, "Flant JSC");
    assert.equal(byLabel["Гражданство"]?.empty, true);
    assert.equal(byLabel["Дата одобрения ВНЖ"]?.empty, true);
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
