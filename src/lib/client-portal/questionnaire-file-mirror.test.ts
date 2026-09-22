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
});
