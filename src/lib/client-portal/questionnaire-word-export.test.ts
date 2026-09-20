import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildQuestionnaireWordDoc,
  findQuestionnaireWordDocument,
  isQuestionnaireWordDocument,
  questionnaireWordFilename,
  QUESTIONNAIRE_WORD_UPLOADER_ID,
} from "@/lib/client-portal/questionnaire-word-export";

describe("questionnaire-word-export", () => {
  it("builds Word HTML with escaped values and sections", () => {
    const html = buildQuestionnaireWordDoc({
      clientName: "Иванов <Test>",
      email: "a@b.c",
      submittedAtLabel: "20.09.2026",
      rows: [
        { section: "Личные данные", label: "ФИО", value: "Иванов & Co" },
        { section: "Личные данные", label: "Телефон", value: "+385" },
        { section: "Документы", label: "Паспорт", value: "файл.pdf (12 KB)" },
      ],
    });
    assert.match(html, /Анкета клиента/);
    assert.match(html, /Иванов &amp; Co/);
    assert.match(html, /Иванов &lt;Test&gt;/);
    assert.match(html, /Личные данные/);
    assert.match(html, /Документы/);
    assert.match(html, /xmlns:w=/);
  });

  it("builds stable filename and detects system docs", () => {
    const name = questionnaireWordFilename("Мария Иванова", "2026-09-20T10:00:00.000Z");
    assert.match(name, /^Anketa-klienta-Мария-Иванова-2026-09-20\.doc$/);
    assert.equal(
      isQuestionnaireWordDocument({
        uploadedByUserId: QUESTIONNAIRE_WORD_UPLOADER_ID,
        fileName: "other.doc",
      }),
      true,
    );
    assert.ok(
      findQuestionnaireWordDocument([
        {
          id: "1",
          fileName: name,
          mimeType: "application/msword",
          sizeBytes: 10,
          uploadedByName: "Система",
          uploadedByUserId: "user",
          createdAt: "2026-09-20T10:00:00.000Z",
        },
      ]),
    );
  });
});
