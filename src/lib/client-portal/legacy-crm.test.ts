import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEGACY_CRM_SOURCE,
  buildLegacyAnswersFromClient,
  buildLegacyReviewRows,
  isLegacyCrmImport,
  legacyCrmFingerprint,
  legacyQuestionnaireId,
  parseSubmittedAtIso,
} from "./legacy-crm.ts";

describe("legacy crm import mapping", () => {
  it("builds staff + identity + sheet snapshot", () => {
    const answers = buildLegacyAnswersFromClient({
      name: "Белоус Екатерина",
      citizenship: "Belavus Katsiaryna",
      passportNumber: "КВ2719292",
      email: "belavus@example.com",
      submittedAt: "01.04.2026",
      bookingAddress: "Ivana Tkalčića 34",
      bookingRange: "04.08-11.08",
      partnerName: "ЛЕНА МОСКВА",
      contract: "дог.оказания услуг",
      referentName: "Вероника",
      notes: "тест",
      rowIndex: 12,
    });

    assert.equal(isLegacyCrmImport(answers), true);
    assert.equal(
      (answers.__import as { source: string }).source,
      LEGACY_CRM_SOURCE,
    );
    assert.equal(answers.full_name_cyrillic, "Белоус Екатерина");
    assert.equal(
      (answers.__staff as { curator: string }).curator,
      "Вероника",
    );
    assert.equal(
      (answers.__legacySheet as Record<string, string>)["Номер паспорта"],
      "КВ2719292",
    );
    assert.ok(Array.isArray(answers.__staff_notes));
    assert.equal(
      legacyQuestionnaireId(legacyCrmFingerprint({
        name: "Белоус Екатерина",
        passportNumber: "КВ2719292",
      })).startsWith("legacy-q-"),
      true,
    );
  });

  it("hides app password in review rows", () => {
    const answers = buildLegacyAnswersFromClient({
      name: "Test",
      passportNumber: "AB1",
      appPassword: "secret-pass",
      sheetColumns: {
        Фамилия: "Test",
        "Пароль для приложения": "secret-pass",
        Договор: "дог",
      },
    });
    const rows = buildLegacyReviewRows(answers, "ru");
    assert.ok(rows.some((r) => r.label === "Договор"));
    assert.ok(!rows.some((r) => r.label.toLowerCase().includes("пароль")));
    assert.ok(!rows.some((r) => r.value === "secret-pass"));
  });

  it("parses dd.mm.yyyy submitted dates", () => {
    assert.equal(parseSubmittedAtIso("01.04.2026")?.startsWith("2026-04-01"), true);
    assert.equal(parseSubmittedAtIso(""), null);
  });
});
