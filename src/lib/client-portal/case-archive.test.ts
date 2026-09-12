import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientNameMatchesTarget,
  isCaseArchived,
  writeCaseArchive,
} from "./case-archive.ts";

describe("case archive", () => {
  it("stores archive flag", () => {
    const answers = writeCaseArchive(
      {},
      {
        archived: true,
        archivedAt: "2026-01-01T00:00:00.000Z",
        archivedByName: "Test",
        archivedByUserId: "u1",
      },
    );
    assert.equal(isCaseArchived(answers), true);
  });

  it("matches surnames and multi-word names", () => {
    assert.equal(clientNameMatchesTarget("Бороденков Иван", "Бороденков"), true);
    assert.equal(clientNameMatchesTarget("Бороденкова", "Бороденкова"), true);
    assert.equal(
      clientNameMatchesTarget("Смоленская Анна", "Смоленская (Израиль)"),
      true,
    );
    assert.equal(
      clientNameMatchesTarget("Кирий Андрей", "Кирий Андрей"),
      true,
    );
    assert.equal(clientNameMatchesTarget("Гулина", "Гулин"), false);
    assert.equal(clientNameMatchesTarget("Гулин Сергей", "Гулин"), true);
  });
});
