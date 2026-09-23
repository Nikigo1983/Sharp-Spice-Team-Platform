import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FORMGRID_IMPORT_KEY } from "./formgrid-import";
import {
  isImportStaffOpenStamp,
  isQuestionnaireNewForStaff,
} from "./questionnaire-new";

describe("questionnaire-new", () => {
  it("treats null staffOpenedAt as new", () => {
    assert.equal(
      isQuestionnaireNewForStaff({
        staffOpenedAt: null,
        createdAt: "2026-09-23T10:00:00.000Z",
        answers: {},
      }),
      true,
    );
  });

  it("treats import-time staffOpenedAt stamp as still new", () => {
    const importedAt = "2026-09-23T12:00:00.000Z";
    const record = {
      staffOpenedAt: importedAt,
      createdAt: importedAt,
      answers: {
        [FORMGRID_IMPORT_KEY]: {
          source: "formgrid",
          importedAt,
        },
      },
    };
    assert.equal(isImportStaffOpenStamp(record), true);
    assert.equal(isQuestionnaireNewForStaff(record), true);
  });

  it("treats a later real open as not new", () => {
    const record = {
      staffOpenedAt: "2026-09-23T15:00:00.000Z",
      createdAt: "2026-09-23T12:00:00.000Z",
      answers: {
        [FORMGRID_IMPORT_KEY]: {
          source: "formgrid",
          importedAt: "2026-09-23T12:00:00.000Z",
        },
      },
    };
    assert.equal(isImportStaffOpenStamp(record), false);
    assert.equal(isQuestionnaireNewForStaff(record), false);
  });
});
