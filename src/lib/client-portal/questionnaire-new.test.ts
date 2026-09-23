import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FORMGRID_IMPORT_KEY } from "./formgrid-import";
import { LEGACY_IMPORT_KEY } from "./legacy-crm";
import {
  isImportStaffOpenStamp,
  isQuestionnaireNewForStaff,
} from "./questionnaire-new";

describe("questionnaire-new", () => {
  it("marks unopened portal clients as new", () => {
    assert.equal(
      isQuestionnaireNewForStaff({
        staffOpenedAt: null,
        createdAt: "2026-09-23T10:00:00.000Z",
        answers: {},
      }),
      true,
    );
  });

  it("does not mark opened portal clients as new", () => {
    assert.equal(
      isQuestionnaireNewForStaff({
        staffOpenedAt: "2026-09-23T11:00:00.000Z",
        createdAt: "2026-09-23T10:00:00.000Z",
        answers: {},
      }),
      false,
    );
  });

  it("never marks legacy or formgrid as new even if unopened", () => {
    assert.equal(
      isQuestionnaireNewForStaff({
        staffOpenedAt: null,
        createdAt: "2026-09-23T10:00:00.000Z",
        answers: {
          [LEGACY_IMPORT_KEY]: {
            source: "croatia_external",
            importedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      }),
      false,
    );
    assert.equal(
      isQuestionnaireNewForStaff({
        staffOpenedAt: null,
        createdAt: "2026-09-23T10:00:00.000Z",
        answers: {
          [FORMGRID_IMPORT_KEY]: {
            source: "formgrid",
            importedAt: "2026-09-23T10:00:00.000Z",
          },
        },
      }),
      false,
    );
  });

  it("detects import-time staffOpenedAt stamps", () => {
    const importedAt = "2026-09-23T12:00:00.000Z";
    assert.equal(
      isImportStaffOpenStamp({
        staffOpenedAt: importedAt,
        createdAt: importedAt,
        answers: {
          [FORMGRID_IMPORT_KEY]: { source: "formgrid", importedAt },
        },
      }),
      true,
    );
  });
});
