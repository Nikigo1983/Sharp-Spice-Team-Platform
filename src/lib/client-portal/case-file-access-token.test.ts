import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isWordDocumentFileName } from "@/lib/client-portal/questionnaire-attachment-formats";
import {
  isWordOpenUrlWithinLimit,
  mintCaseFileAccessToken,
  mintCompactCaseFileToken,
  toMsWordOpenUri,
  verifyCaseFileAccessToken,
  verifyCompactCaseFileToken,
} from "@/lib/client-portal/case-file-access-token";

describe("case-file-access-token", () => {
  it("mints and verifies short-lived file tokens", async () => {
    const token = await mintCaseFileAccessToken({
      fileId: "doc-1",
      questionnaireId: "q-1",
      expiresInSec: 60,
    });
    const claims = await verifyCaseFileAccessToken(token);
    assert.deepEqual(claims, {
      fileId: "doc-1",
      questionnaireId: "q-1",
    });
  });

  it("builds compact Word-open tokens under length limit", () => {
    const fileId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const questionnaireId = "ffffffff-0000-4111-8222-333333333333";
    const compact = mintCompactCaseFileToken({
      fileId,
      questionnaireId,
      expiresInSec: 600,
    });
    assert.equal(
      verifyCompactCaseFileToken(compact)?.fileId,
      fileId,
    );
    assert.equal(
      verifyCompactCaseFileToken(compact)?.questionnaireId,
      questionnaireId,
    );

    const fileUrl = `https://sharp-spice-team-platform.vercel.app/api/client-cases/w/${compact}`;
    assert.equal(isWordOpenUrlWithinLimit(fileUrl), true);
    assert.equal(
      toMsWordOpenUri(fileUrl),
      `ms-word:ofe|u|${fileUrl}`,
    );
    assert.ok(toMsWordOpenUri(fileUrl).length < 280);
  });

  it("detects Word filenames", () => {
    assert.equal(isWordDocumentFileName("a.doc"), true);
    assert.equal(isWordDocumentFileName("a.DOCX"), true);
    assert.equal(isWordDocumentFileName("a.pdf"), false);
  });
});
