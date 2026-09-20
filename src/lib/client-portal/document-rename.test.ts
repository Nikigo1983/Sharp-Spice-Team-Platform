import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renameFileNamePreservingExt } from "@/lib/client-portal/questionnaire-attachment-formats";
import { renameStaffDocument } from "@/lib/client-portal/staff-case-meta";

describe("renameFileNamePreservingExt", () => {
  it("keeps original extension when user omits or changes it", () => {
    assert.equal(
      renameFileNamePreservingExt("passport.pdf", "Паспорт клиента"),
      "Паспорт клиента.pdf",
    );
    assert.equal(
      renameFileNamePreservingExt("passport.pdf", "dogovor.docx"),
      "dogovor.pdf",
    );
    assert.equal(
      renameFileNamePreservingExt("anketa.doc", "Anketa-Maria.doc"),
      "Anketa-Maria.doc",
    );
    assert.equal(renameFileNamePreservingExt("a.pdf", "   "), null);
  });
});

describe("renameStaffDocument", () => {
  it("updates only the target document name", () => {
    const answers = {
      __staff_documents: [
        {
          id: "1",
          fileName: "a.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
          uploadedByName: "A",
          uploadedByUserId: "u",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "2",
          fileName: "b.pdf",
          mimeType: "application/pdf",
          sizeBytes: 20,
          uploadedByName: "A",
          uploadedByUserId: "u",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const next = renameStaffDocument(answers, "2", "Новое имя.pdf");
    assert.equal(
      (next.__staff_documents as Array<{ fileName: string }>)[0]?.fileName,
      "a.pdf",
    );
    assert.equal(
      (next.__staff_documents as Array<{ fileName: string }>)[1]?.fileName,
      "Новое имя.pdf",
    );
  });
});
