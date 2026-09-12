import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFormgridRowKey,
  isFormgridRowDismissed,
} from "@/lib/leads/formgrid-row-key";

describe("formgrid active leads dismiss filter", () => {
  it("detects dismissed rows by stable row key", () => {
    const headers = ["ФИО", "Email", "Телефон"];
    const row = ["Джан Арман", "arm@example.com", "+385111"];
    const key = buildFormgridRowKey(headers, row);
    const dismissed = new Set([key]);
    assert.equal(isFormgridRowDismissed(headers, row, dismissed), true);
    assert.equal(
      isFormgridRowDismissed(headers, ["Другой", "x@y.com", "1"], dismissed),
      false,
    );
  });
});
