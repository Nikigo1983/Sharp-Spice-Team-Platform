import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatCyrillicNameIof,
  formatLatinNameIof,
} from "./person-name-order";

describe("formatCyrillicNameIof", () => {
  it("reorders FIO to IOF for three parts", () => {
    assert.equal(
      formatCyrillicNameIof("Иванов Иван Иванович"),
      "Иван Иванович Иванов",
    );
    assert.equal(
      formatCyrillicNameIof("Загурская Виктория Валериевна"),
      "Виктория Валериевна Загурская",
    );
  });

  it("reorders two-part surname-given", () => {
    assert.equal(formatCyrillicNameIof("Белоус Екатерина"), "Екатерина Белоус");
  });

  it("is idempotent for IOF", () => {
    assert.equal(
      formatCyrillicNameIof("Иван Иванович Иванов"),
      "Иван Иванович Иванов",
    );
    assert.equal(
      formatCyrillicNameIof("Виктория Валериевна Загурская"),
      "Виктория Валериевна Загурская",
    );
  });

  it("leaves short / foreign names alone when unclear", () => {
    assert.equal(formatCyrillicNameIof("Анна"), "Анна");
    assert.equal(
      formatCyrillicNameIof("De castro, brigeneth, baguinaon"),
      "De castro, brigeneth, baguinaon",
    );
  });
});

describe("formatLatinNameIof", () => {
  it("reorders title-case latin surname-given", () => {
    assert.equal(formatLatinNameIof("Rybin Oleg"), "Oleg Rybin");
    assert.equal(formatLatinNameIof("Oleg Rybin"), "Oleg Rybin");
  });
});
