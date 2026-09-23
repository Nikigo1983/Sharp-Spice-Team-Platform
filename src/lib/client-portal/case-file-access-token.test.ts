import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isWordDocumentFileName } from "@/lib/client-portal/questionnaire-attachment-formats";
import {
  mintCaseFileAccessToken,
  toMsWordOpenUri,
  verifyCaseFileAccessToken,
} from "@/lib/client-portal/case-file-access-token";
import {
  isWordOpenUrlWithinLimit,
  mintCompactCaseFileToken,
  verifyCompactCaseFileToken,
} from "@/lib/client-portal/case-file-office-token";
import {
  buildMsWordAbbreviatedUri,
  buildMsWordEditUri,
  buildWordDocumentFileUrl,
  wordOpenPathFileName,
} from "@/lib/client-portal/case-file-word-open-url";

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
    assert.equal(verifyCompactCaseFileToken(compact)?.fileId, fileId);
    assert.equal(
      verifyCompactCaseFileToken(compact)?.questionnaireId,
      questionnaireId,
    );

    const fileUrl = buildWordDocumentFileUrl(
      "https://sharp-spice-team-platform.vercel.app",
      compact,
      "anketa.doc",
    );
    assert.match(fileUrl, /\/document\.doc$/);
    assert.equal(isWordOpenUrlWithinLimit(fileUrl), true);
    assert.equal(toMsWordOpenUri(fileUrl), `ms-word:ofe|u|${fileUrl}`);
    assert.equal(buildMsWordEditUri(fileUrl), `ms-word:ofe|u|${fileUrl}`);
    assert.equal(buildMsWordAbbreviatedUri(fileUrl), `ms-word:${fileUrl}`);
    assert.ok(toMsWordOpenUri(fileUrl).length < 300);
  });

  it("supports legacy non-UUID questionnaire ids", () => {
    const fileId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const questionnaireId = "legacy-q-a1b2c3d4";
    const compact = mintCompactCaseFileToken({
      fileId,
      questionnaireId,
      expiresInSec: 600,
    });
    assert.match(compact, /^v2\./);
    assert.deepEqual(verifyCompactCaseFileToken(compact), {
      fileId,
      questionnaireId,
    });
    const fileUrl = buildWordDocumentFileUrl(
      "https://sharp-spice-team-platform.vercel.app",
      compact,
      "Anketa.docx",
    );
    assert.match(fileUrl, /\/document\.docx$/);
    assert.equal(isWordOpenUrlWithinLimit(fileUrl), true);
  });

  it("picks Word path extension from original name", () => {
    assert.equal(wordOpenPathFileName("a.DOCX"), "document.docx");
    assert.equal(wordOpenPathFileName("a.doc"), "document.doc");
  });

  it("detects Word filenames", () => {
    assert.equal(isWordDocumentFileName("a.doc"), true);
    assert.equal(isWordDocumentFileName("a.DOCX"), true);
    assert.equal(isWordDocumentFileName("a.pdf"), false);
  });
});
