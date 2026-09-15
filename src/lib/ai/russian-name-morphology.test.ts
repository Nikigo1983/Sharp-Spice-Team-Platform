import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatRussianNamePossessiveU,
  inferRussianPersonGender,
  inflectRussianPersonNameGenitive,
} from "@/lib/ai/russian-name-morphology";

describe("inferRussianPersonGender", () => {
  it("detects feminine surnames and query hints", () => {
    assert.equal(inferRussianPersonGender("ПЕРМЯКОВА"), "female");
    assert.equal(inferRussianPersonGender("Иванова Мария"), "female");
    assert.equal(
      inferRussianPersonGender("ПЕРМЯКОВ", "Пермяковой"),
      "female",
    );
  });

  it("detects masculine surnames", () => {
    assert.equal(inferRussianPersonGender("Иванов"), "male");
    assert.equal(inferRussianPersonGender("МАЗУРИН"), "male");
    assert.equal(inferRussianPersonGender("Петров Сергей"), "male");
  });
});

describe("inflectRussianPersonNameGenitive", () => {
  it("declines feminine surnames after У", () => {
    assert.equal(
      inflectRussianPersonNameGenitive("ПЕРМЯКОВА", "Пермяковой"),
      "ПЕРМЯКОВОЙ",
    );
    assert.equal(inflectRussianPersonNameGenitive("Иванова"), "Ивановой");
    assert.equal(
      formatRussianNamePossessiveU("ПЕРМЯКОВА", "Пермяковой"),
      "У **ПЕРМЯКОВОЙ**",
    );
  });

  it("declines masculine surnames after У", () => {
    assert.equal(inflectRussianPersonNameGenitive("Иванов"), "Иванова");
    assert.equal(inflectRussianPersonNameGenitive("МАЗУРИН"), "МАЗУРИНА");
    assert.equal(
      formatRussianNamePossessiveU("МАЗУРИН"),
      "У **МАЗУРИНА**",
    );
  });

  it("declines full feminine FIO", () => {
    assert.equal(
      inflectRussianPersonNameGenitive("Пермякова Анна"),
      "Пермяковой Анны",
    );
  });
});
