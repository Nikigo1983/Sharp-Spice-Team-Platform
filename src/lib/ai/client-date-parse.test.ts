import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dateInMonths,
  extractAllMonthsFromQuery,
  extractYearFromQuery,
  isSubmissionDateQuery,
  parseDateParts,
  queryContainsDateLiteral,
  stripDateLiteralsFromQuery,
} from "./client-date-parse";

describe("client-date-parse", () => {
  it("parses DD.MM.YYYY as day-month-year", () => {
    assert.deepEqual(parseDateParts("01.02.2026"), {
      day: 1,
      month: 2,
      year: 2026,
    });
    assert.deepEqual(parseDateParts("15.01.2025"), {
      day: 15,
      month: 1,
      year: 2025,
    });
  });

  it("matches february submission dates", () => {
    assert.equal(dateInMonths("01.02.2026", [2]), true);
    assert.equal(dateInMonths("01.02.2026", [1]), false);
    assert.equal(dateInMonths("01.02.2026", [2], 2026), true);
    assert.equal(dateInMonths("01.02.2026", [2], 2025), false);
  });

  it("extracts multiple months from query", () => {
    assert.deepEqual(
      extractAllMonthsFromQuery(
        "найди клиентов, заявки на которых мы подавали в январе и феврале",
      ),
      [1, 2],
    );
  });

  it("detects submission-date queries", () => {
    assert.equal(
      isSubmissionDateQuery("заявки на которых мы подавали в январе"),
      true,
    );
    assert.equal(isSubmissionDateQuery("букинг заканчивается в июне"), false);
  });

  it("strips date literals before digit heuristics", () => {
    assert.equal(queryContainsDateLiteral("клиент от 01.02.2026"), true);
    assert.equal(
      stripDateLiteralsFromQuery("клиент от 01.02.2026").replace(/\D/g, ""),
      "",
    );
  });

  it("extracts year from query", () => {
    assert.equal(extractYearFromQuery("подача в январе 2026"), 2026);
    assert.equal(extractYearFromQuery("подача в январе"), null);
  });
});
