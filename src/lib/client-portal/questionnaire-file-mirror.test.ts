import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mirrorQuestionnaireFilesIntoStaffDocuments } from "@/lib/client-portal/questionnaire-file-mirror";
import {
  QUESTIONNAIRE_FILE_UPLOADER_ID,
  QUESTIONNAIRE_FILE_UPLOADER_NAME,
  isQuestionnaireMirroredAttachment,
} from "@/lib/client-portal/questionnaire-word-export";
import { readStaffDocuments } from "@/lib/client-portal/staff-case-meta";

describe("mirrorQuestionnaireFilesIntoStaffDocuments", () => {
  it("copies questionnaire file answers into staff documents once", () => {
    const answers = {
      full_name_cyrillic: "Тест",
      doc_passport_pdf: {
        id: "file-1",
        fileName: "passport.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
      },
      doc_signature_sample: {
        id: "file-2",
        fileName: "sign.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 500,
      },
      has_criminal_record_certificate: "yes",
    };

    const first = mirrorQuestionnaireFilesIntoStaffDocuments(
      answers,
      "2026-09-22T10:00:00.000Z",
    );
    assert.equal(first.added, 2);
    const docs = readStaffDocuments(first.answers);
    assert.equal(docs.length, 2);
    assert.equal(docs[0]?.uploadedByUserId, QUESTIONNAIRE_FILE_UPLOADER_ID);
    assert.equal(docs[0]?.uploadedByName, QUESTIONNAIRE_FILE_UPLOADER_NAME);
    assert.ok(docs.every(isQuestionnaireMirroredAttachment));

    const second = mirrorQuestionnaireFilesIntoStaffDocuments(first.answers);
    assert.equal(second.added, 0);
    assert.equal(readStaffDocuments(second.answers).length, 2);
  });

  it("skips non-file answers", () => {
    const result = mirrorQuestionnaireFilesIntoStaffDocuments({
      note: "text",
      empty: null,
    });
    assert.equal(result.added, 0);
    assert.equal(readStaffDocuments(result.answers).length, 0);
  });

  it("mirrors Formgrid stored files that are not portal file fields", () => {
    const result = mirrorQuestionnaireFilesIntoStaffDocuments({
      __formgridFiles: {
        "Паспорт (PDF)": {
          id: "fg-1",
          fileName: "passport.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1200,
          sourceUrl: "https://example.com/p.pdf",
          sheetColumn: "Паспорт (PDF)",
          storedAt: "2026-09-24T10:00:00.000Z",
        },
      },
    });
    assert.equal(result.added, 1);
    const docs = readStaffDocuments(result.answers);
    assert.equal(docs[0]?.id, "fg-1");
    assert.equal(docs[0]?.uploadedByUserId, QUESTIONNAIRE_FILE_UPLOADER_ID);
  });

  it("skips staff-removed attachment ids on remirror", () => {
    const answers = {
      doc_passport_pdf: {
        id: "file-1",
        fileName: "passport.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
      },
      doc_signature_sample: {
        id: "file-2",
        fileName: "sign.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 500,
      },
      __staff_documents_removed: ["file-1"],
    };
    const result = mirrorQuestionnaireFilesIntoStaffDocuments(answers);
    assert.equal(result.added, 1);
    const docs = readStaffDocuments(result.answers);
    assert.equal(docs.length, 1);
    assert.equal(docs[0]?.id, "file-2");
  });

  it("skips removed Formgrid stored file ids", () => {
    const result = mirrorQuestionnaireFilesIntoStaffDocuments({
      __staff_documents_removed: ["fg-1"],
      __formgridFiles: {
        "Паспорт (PDF)": {
          id: "fg-1",
          fileName: "passport.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1200,
          sourceUrl: "https://example.com/p.pdf",
          sheetColumn: "Паспорт (PDF)",
          storedAt: "2026-09-24T10:00:00.000Z",
        },
      },
    });
    assert.equal(result.added, 0);
    assert.equal(readStaffDocuments(result.answers).length, 0);
  });

});
