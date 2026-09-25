import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isApplicationSubmitted,
  isStaffNewClientQueue,
  writeApplicationSubmitted,
  writeStaffNewClientQueue,
} from "./application-submitted";
import {
  FORMGRID_IMPORT_KEY,
  setFormgridNewClientQueue,
} from "./formgrid-import";
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

  it("badges formgrid only when newClientQueue is set", () => {
    const withoutQueue = {
      answers: {
        [FORMGRID_IMPORT_KEY]: {
          source: "formgrid",
          importedAt: "2026-09-23T10:00:00.000Z",
        },
      },
    };
    assert.equal(isPortalNewClientBadge(withoutQueue), false);

    const withQueue = {
      answers: setFormgridNewClientQueue(withoutQueue.answers, true),
    };
    assert.equal(isPortalNewClientBadge(withQueue), true);

    const submitted = {
      answers: writeApplicationSubmitted(withQueue.answers, {
        submittedAt: "2026-09-24T10:00:00.000Z",
        submittedByUserId: "u1",
        submittedByName: "Manager",
      }),
    };
    assert.equal(isPortalNewClientBadge(submitted), false);
  });

  it("does not treat bare legacy as portal new", () => {
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
  });

  it("badges legacy after staff places into new-client queue", () => {
    const legacy = {
      [LEGACY_IMPORT_KEY]: {
        source: "croatia_external",
        importedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    assert.equal(isPortalNewClientBadge({ answers: legacy }), false);

    const queued = writeStaffNewClientQueue(legacy, {
      queuedAt: "2026-09-25T12:00:00.000Z",
      queuedByUserId: "u1",
      queuedByName: "Manager",
    });
    assert.equal(isStaffNewClientQueue(queued), true);
    assert.equal(isPortalNewClientBadge({ answers: queued }), true);

    const submitted = writeApplicationSubmitted(queued, {
      submittedAt: "2026-09-25T13:00:00.000Z",
      submittedByUserId: "u1",
      submittedByName: "Manager",
    });
    assert.equal(isStaffNewClientQueue(submitted), false);
    assert.equal(isApplicationSubmitted(submitted), true);
    assert.equal(isPortalNewClientBadge({ answers: submitted }), false);
  });

  it("re-queue clears prior application submitted stamp", () => {
    const submitted = writeApplicationSubmitted(
      { full_name_cyrillic: "Иванова" },
      {
        submittedAt: "2026-09-24T10:00:00.000Z",
        submittedByUserId: "u1",
        submittedByName: "Manager",
      },
    );
    assert.equal(isApplicationSubmitted(submitted), true);

    const requeued = writeStaffNewClientQueue(submitted, {
      queuedAt: "2026-09-25T12:00:00.000Z",
      queuedByUserId: "u1",
      queuedByName: "Manager",
    });
    assert.equal(isApplicationSubmitted(requeued), false);
    assert.equal(isStaffNewClientQueue(requeued), true);
    assert.equal(isPortalNewClientBadge({ answers: requeued }), true);
  });
});
