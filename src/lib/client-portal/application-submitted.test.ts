import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isApplicationSubmitted,
  writeApplicationSubmitted,
} from "./application-submitted";
import { FORMGRID_IMPORT_KEY } from "./formgrid-import";
import { LEGACY_IMPORT_KEY } from "./legacy-crm";
import {
  isPortalNewClientBadge,
  isQuestionnaireNewForStaff,
} from "./questionnaire-new";

describe("application submitted / portal new badge", () => {
  it("clears portal new badge after application submitted", () => {
    const before = { answers: { full_name_cyrillic: "Иванов" } };
    assert.equal(isPortalNewClientBadge(before), true);

    const after = {
      answers: writeApplicationSubmitted(before.answers, {
        submittedAt: "2026-09-24T10:00:00.000Z",
        submittedByUserId: "u1",
        submittedByName: "Manager",
      }),
    };
    assert.equal(isApplicationSubmitted(after.answers), true);
    assert.equal(isPortalNewClientBadge(after), false);
    assert.equal(
      isQuestionnaireNewForStaff({
        staffOpenedAt: null,
        createdAt: "2026-09-24T09:00:00.000Z",
        answers: after.answers,
      }),
      false,
    );
  });

  it("does not treat legacy/formgrid as portal new", () => {
    assert.equal(
      isPortalNewClientBadge({
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
      isPortalNewClientBadge({
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
});
