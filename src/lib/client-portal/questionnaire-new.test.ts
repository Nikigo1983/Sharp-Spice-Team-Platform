import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FORMGRID_IMPORT_KEY } from "./formgrid-import";
import { LEGACY_IMPORT_KEY } from "./legacy-crm";
import {
  isImportStaffOpenStamp,
  isPortalNewClientBadge,
  isQuestionnaireNewForStaff,
} from "./questionnaire-new";

describe("questionnaire-new", () => {
  it("shows yellow badge for portal clients until application submitted", () => {
    const opened = {
      staffOpenedAt: "2026-09-23T11:00:00.000Z",
      createdAt: "2026-09-23T10:00:00.000Z",
      answers: {},
    };
    assert.equal(isPortalNewClientBadge(opened), true);
    assert.equal(isQuestionnaireNewForStaff(opened), false);

    const unopened = {
      staffOpenedAt: null,
      createdAt: "2026-09-23T10:00:00.000Z",
      answers: {},
    };
    assert.equal(isPortalNewClientBadge(unopened), true);
    assert.equal(isQuestionnaireNewForStaff(unopened), true);
  });

  it("never badges bare legacy; formgrid only with queue flag", () => {
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
    assert.equal(
      isPortalNewClientBadge({
        answers: {
          [FORMGRID_IMPORT_KEY]: {
            source: "formgrid",
            importedAt: "2026-09-23T10:00:00.000Z",
            newClientQueue: true,
          },
        },
      }),
      true,
    );
  });

  it("badges staff-queued legacy like Ivanova", () => {
    assert.equal(
      isPortalNewClientBadge({
        answers: {
          [LEGACY_IMPORT_KEY]: {
            source: "croatia_external",
            importedAt: "2026-01-01T00:00:00.000Z",
          },
          __staffNewClientQueue: {
            queued: true,
            queuedAt: "2026-09-25T12:00:00.000Z",
            queuedByUserId: "u1",
            queuedByName: "Manager",
          },
        },
      }),
      true,
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
