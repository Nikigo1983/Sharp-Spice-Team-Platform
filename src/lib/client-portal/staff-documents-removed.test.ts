import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  markStaffDocumentRemoved,
  markStaffWordDocumentDismissed,
  isStaffWordDocumentDismissed,
  readRemovedStaffDocumentIds,
  removeStaffDocument,
} from "@/lib/client-portal/staff-case-meta";
import { QUESTIONNAIRE_FILE_UPLOADER_ID } from "@/lib/client-portal/questionnaire-word-export";

describe("staff document removal tombstones", () => {
  it("records removed ids and survives list removal", () => {
    const answers = {
      __staff_documents: [
        {
          id: "file-1",
          fileName: "a.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1,
          uploadedByName: "Из анкеты",
          uploadedByUserId: QUESTIONNAIRE_FILE_UPLOADER_ID,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    let next = removeStaffDocument(answers, "file-1");
    next = markStaffDocumentRemoved(next, "file-1");
    assert.deepEqual(readRemovedStaffDocumentIds(next), ["file-1"]);
    assert.equal(isStaffWordDocumentDismissed(next), false);
    next = markStaffWordDocumentDismissed(next, true);
    assert.equal(isStaffWordDocumentDismissed(next), true);
    next = markStaffWordDocumentDismissed(next, false);
    assert.equal(isStaffWordDocumentDismissed(next), false);
  });
});
