import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MAX_ATTACHMENT_MB,
  staffDocumentUploadFailureMessage,
  staffFileTooLargeMessage,
} from "./questionnaire-attachment-formats.ts";

describe("staff document upload messages", () => {
  it("explains oversized files clearly", () => {
    const msg = staffFileTooLargeMessage("платежки.pdf");
    assert.match(msg, /платежки\.pdf/);
    assert.match(msg, /слишком большой/i);
    assert.match(msg, /Уменьшите/);
    assert.match(msg, new RegExp(`${DEFAULT_MAX_ATTACHMENT_MB} МБ`));
    assert.doesNotMatch(msg, /ответ сервера/i);
  });

  it("maps FILE_TOO_LARGE and 413 to the size message", () => {
    assert.equal(
      staffDocumentUploadFailureMessage({
        fileName: "big.pdf",
        status: 413,
        errorCode: "FILE_TOO_LARGE",
        responseLooksLikeJson: true,
      }),
      staffFileTooLargeMessage("big.pdf"),
    );
    assert.equal(
      staffDocumentUploadFailureMessage({
        fileName: "big.pdf",
        status: 413,
        responseLooksLikeJson: false,
      }),
      staffFileTooLargeMessage("big.pdf"),
    );
  });

  it("maps non-JSON server responses to the size message", () => {
    const msg = staffDocumentUploadFailureMessage({
      fileName: "Milai платежки.pdf",
      status: 500,
      responseLooksLikeJson: false,
    });
    assert.equal(msg, staffFileTooLargeMessage("Milai платежки.pdf"));
    assert.doesNotMatch(msg, /ответ сервера/i);
  });
});
