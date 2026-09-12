import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_DOCUMENT_ACCEPT,
  getClientDocumentUrl,
  isAllowedClientDocument,
  normalizeClientDocumentContentType,
} from "./document-formats.ts";

describe("client document formats", () => {
  it("accepts common office and image types", () => {
    assert.equal(
      normalizeClientDocumentContentType("application/pdf", "pass.pdf"),
      "application/pdf",
    );
    assert.ok(isAllowedClientDocument("scan.JPG", "image/jpeg"));
    assert.ok(CLIENT_DOCUMENT_ACCEPT.includes(".pdf"));
  });

  it("builds download url", () => {
    assert.equal(
      getClientDocumentUrl("CL-1", "CD-2"),
      "/api/clients/CL-1/documents/CD-2",
    );
    assert.equal(
      getClientDocumentUrl("CL-1", "CD-2", { download: true }),
      "/api/clients/CL-1/documents/CD-2?download=1",
    );
  });
});
