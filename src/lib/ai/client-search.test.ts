import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClientSearchQuery,
  buildNormalizedNameFields,
  scoreClientRecord,
  type SearchField,
} from "@/lib/ai/client-search";
import {
  getRussianNameLemmaVariants,
  morphNameMatch,
} from "@/lib/ai/russian-name-morphology";

function nameFields(name: string, latin?: string): SearchField[] {
  const fields: SearchField[] = [
    { label: "ФИО / фамилия", value: name, category: "name" },
    ...buildNormalizedNameFields(name),
  ];
  if (latin) {
    fields.push(
      { label: "латиница", value: latin, category: "name" },
      ...buildNormalizedNameFields(latin),
    );
  }
  return fields;
}

describe("client-search Ratnikova-like full-name priority", () => {
  it("resolves exact surname+first in either order to score >= 90", () => {
    const record = nameFields("Ратникова Мария Александровна", "Ratnikova Maria");
    for (const q of ["Ратникова Мария", "Мария Ратникова", "ратникова мария"]) {
      const scored = scoreClientRecord(buildClientSearchQuery(q), record);
      assert.ok(scored.score >= 90, `${q} → ${scored.score}`);
    }
  });

  it("does not promote first-name-only morph hits for multi-token queries", () => {
    const query = buildClientSearchQuery("Ратникова Мария");
    const weak = [
      nameFields("Бякова Мария Николаевна", "Byakova Mariia"),
      nameFields("БОГОМАЗОВА", "Mariia Bogomazova"),
      nameFields("Дарчиев Марина"),
    ];
    for (const fields of weak) {
      const scored = scoreClientRecord(query, fields);
      assert.ok(
        scored.score < 35,
        `weak candidate scored ${scored.score}: ${scored.matchedFields.join(",")}`,
      );
    }
  });

  it("surname-only does not match unrelated -никова via *овова morph collision", () => {
    const query = buildClientSearchQuery("Ратникова");
    for (const name of ["БРОННИКОВА", "Мясникова Екатерина", "ПАВЛИКОВА Ксения"]) {
      const scored = scoreClientRecord(query, nameFields(name));
      assert.ok(
        scored.score < 80,
        `${name} unexpectedly strong: ${scored.score} ${scored.matchedFields}`,
      );
    }
  });

  it("transliterated Ratnikova Maria matches Cyrillic record", () => {
    const scored = scoreClientRecord(
      buildClientSearchQuery("Ratnikova Maria"),
      nameFields("Ратникова Мария Александровна", "Ratnikova Maria"),
    );
    assert.ok(scored.score >= 80, String(scored.score));
  });

  it("two strong exact-name records remain distinguishable by score", () => {
    const query = buildClientSearchQuery("Ратникова Мария");
    const a = scoreClientRecord(
      query,
      nameFields("Ратникова Мария Александровна"),
    );
    const b = scoreClientRecord(query, nameFields("Ратникова Мария"));
    assert.ok(a.score >= 90 && b.score >= 90);
  });

  it("no candidate stays below viable threshold", () => {
    const scored = scoreClientRecord(
      buildClientSearchQuery("Ратникова Мария"),
      nameFields("Сидоров Пётр"),
    );
    assert.ok(scored.score < 35);
  });

  it("morphology does not invent *овова double-suffix lemmas", () => {
    const lemmas = getRussianNameLemmaVariants("ратникова");
    assert.ok(!lemmas.some((v) => /овова$/i.test(v)), lemmas.join(","));
    assert.equal(morphNameMatch("ратникова", "бронникова"), false);
  });
});
