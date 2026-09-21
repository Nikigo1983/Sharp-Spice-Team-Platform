import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isWordDocumentFileName } from "@/lib/client-portal/questionnaire-attachment-formats";
import {
  mintCaseFileAccessToken,
  toMsWordOpenUri,
  verifyCaseFileAccessToken,
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

  it("builds Word protocol URI and detects Word filenames", () => {
    assert.equal(isWordDocumentFileName("a.doc"), true);
    assert.equal(isWordDocumentFileName("a.DOCX"), true);
    assert.equal(isWordDocumentFileName("a.pdf"), false);
    assert.equal(
      toMsWordOpenUri("https://example.com/file.doc?x=1"),
      "ms-word:ofv|u|https://example.com/file.doc?x=1",
    );
  });
});
