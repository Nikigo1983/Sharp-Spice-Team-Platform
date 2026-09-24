/**
 * Manager-fill CRM ops section for portal + Formgrid intake review.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FORMGRID_CRM_OPS_COLUMNS,
  FORMGRID_CRM_OPS_KEY,
  MANAGER_FILL_SECTION,
  applyFormgridCrmOpsEdits,
  buildFormgridReviewRows,
  buildManagerFillReviewRows,
  emptyFormgridCrmOpsSheet,
  readFormgridCrmOpsSheet,
} from "@/lib/client-portal/formgrid-import";
import { EXTERNAL_COLUMN_ORDER } from "@/lib/client-portal/legacy-crm";
import { buildReviewRows } from "@/lib/client-portal/questionnaire-service";
import { readStaffFields } from "@/lib/client-portal/staff-fields";

describe("manager fill section", () => {
  it("includes Адвокат and renamed section for Formgrid review", () => {
    assert.ok(FORMGRID_CRM_OPS_COLUMNS.includes("Адвокат"));
    const rows = buildFormgridReviewRows({
      __import: { source: "formgrid" },
      __formgridSheet: { "1. Name": "Test" },
      __crmOpsSheet: emptyFormgridCrmOpsSheet({ Адвокат: "Иванов" }),
    });
    const lawyer = rows.find((r) => r.label === "Адвокат");
    assert.ok(lawyer);
    assert.equal(lawyer!.section, MANAGER_FILL_SECTION);
    assert.equal(lawyer!.value, "Иванов");
    assert.equal(lawyer!.questionId, `${FORMGRID_CRM_OPS_KEY}.Адвокат`);
    assert.equal(
      rows.filter((r) => r.section === "CRM / процесс").length,
      0,
    );
  });

  it("remaps Formgrid FIO column labels to IOF wording", () => {
    const rows = buildFormgridReviewRows({
      __import: { source: "formgrid" },
      __formgridSheet: {
        "1. Фамилия, Имя, Отчество (кириллицей)": "Олег Михайлович Рыбин",
        "2. ФИО (латинскими)": "Oleg Rybin",
        "13. Отец: ФИО (латинскими)": "Mixail Vasilevich Rybin",
        "14. Мать: ФИО (латинскими)": "Rybina Natalia Vasilevna",
      },
    });
    assert.equal(
      rows.find((r) => r.questionId.endsWith("кириллицей)"))?.label,
      "1. Имя, Отчество, Фамилия (кириллицей)",
    );
    assert.equal(
      rows.find((r) => r.questionId.includes("2. ФИО"))?.label,
      "2. Имя, Отчество, Фамилия (латинскими)",
    );
    assert.equal(
      rows.find((r) => r.questionId.includes("Отец"))?.label,
      "13. Отец: Имя, Отчество, Фамилия (латинскими)",
    );
    const mother = rows.find((r) => r.questionId.includes("Мать"));
    assert.equal(
      mother?.label,
      "14. Мать: Имя, Отчество, Фамилия (латинскими)",
    );
    assert.equal(mother?.value, "Natalia Vasilevna Rybina");
  });

  it("appends manager fill block for portal questionnaire answers", () => {
    const rows = buildReviewRows(
      {
        full_name_cyrillic: "Тестова Анна",
        consent_personal_data: true,
      },
      "ru",
    );
    const managerRows = rows.filter(
      (r) => r.section === MANAGER_FILL_SECTION,
    );
    assert.ok(managerRows.length >= FORMGRID_CRM_OPS_COLUMNS.length);
    assert.ok(managerRows.some((r) => r.label === "Адвокат"));
    assert.ok(managerRows.some((r) => r.label === "Дата подачи"));
    assert.ok(managerRows.some((r) => r.label === "Имя референта"));
  });

  it("persists Адвокат into __crmOpsSheet and __staff.lawyer", () => {
    const next = applyFormgridCrmOpsEdits(
      { full_name_cyrillic: "A" },
      { Адвокат: "Петрова" },
    );
    const sheet = readFormgridCrmOpsSheet(next);
    assert.equal(sheet["Адвокат"], "Петрова");
    assert.equal(readStaffFields(next).lawyer, "Петрова");
  });

  it("exposes Адвокат in legacy External column order", () => {
    assert.ok((EXTERNAL_COLUMN_ORDER as readonly string[]).includes("Адвокат"));
  });

  it("buildManagerFillReviewRows is empty-seeded by default", () => {
    const rows = buildManagerFillReviewRows();
    assert.equal(rows.length, FORMGRID_CRM_OPS_COLUMNS.length);
    assert.ok(rows.every((r) => r.section === MANAGER_FILL_SECTION));
  });
});
