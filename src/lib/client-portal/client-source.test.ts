import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isManualStaffImport,
  markManualStaffAnswers,
  resolveIntakeClientSource,
} from "./client-source.ts";

describe("intake client source", () => {
  it("detects legacy / formgrid / manual / portal", () => {
    assert.equal(
      resolveIntakeClientSource({
        __import: { source: "croatia_external" },
      }),
      "legacy",
    );
    assert.equal(
      resolveIntakeClientSource({
        __import: { source: "formgrid" },
      }),
      "formgrid",
    );
    assert.equal(
      resolveIntakeClientSource({
        __import: { source: "manual_staff" },
      }),
      "manual",
    );
    assert.equal(
      resolveIntakeClientSource({ full_name_cyrillic: "Иванов" }),
      "portal",
    );
  });

  it("marks manual staff answers", () => {
    const marked = markManualStaffAnswers(
      { full_name_cyrillic: "Тест" },
      { createdByUserId: "u1", createdByName: "Manager" },
    );
    assert.equal(isManualStaffImport(marked), true);
    assert.equal(resolveIntakeClientSource(marked), "manual");
  });
});
