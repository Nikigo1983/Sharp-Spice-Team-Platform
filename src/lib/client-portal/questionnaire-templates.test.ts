import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CROATIA_TRP_SCHEMA,
  SPAIN_TRP_SCHEMA,
  SLOVENIA_TRP_SCHEMA,
} from "@/lib/client-portal/questionnaire-schema";
import {
  needsVnzhCountrySelection,
  resolveSchemaForRecord,
  resolveVnzhCountry,
  VNZH_COUNTRY_ANSWER_KEY,
} from "@/lib/client-portal/questionnaire-templates";

describe("questionnaire-templates", () => {
  it("keeps legacy drafts without country on Croatia schema", () => {
    const record = {
      status: "draft" as const,
      answers: { full_name_cyrillic: "Иванов" },
    };
    assert.equal(resolveVnzhCountry(record), "croatia");
    assert.equal(needsVnzhCountrySelection(record), false);
    assert.equal(
      resolveSchemaForRecord(record).templateKey,
      CROATIA_TRP_SCHEMA.templateKey,
    );
  });

  it("asks new empty drafts to pick a country", () => {
    const record = { status: "draft" as const, answers: {} };
    assert.equal(resolveVnzhCountry(record), null);
    assert.equal(needsVnzhCountrySelection(record), true);
  });

  it("asks drafts with only auto-filled email to pick a country", () => {
    const record = {
      status: "draft" as const,
      answers: { contact_email: "maya@example.com" },
    };
    assert.equal(resolveVnzhCountry(record), null);
    assert.equal(needsVnzhCountrySelection(record), true);
  });

  it("resolves Spain and Slovenia schemas from country answer", () => {
    assert.equal(
      resolveSchemaForRecord({
        status: "draft",
        answers: { [VNZH_COUNTRY_ANSWER_KEY]: "spain" },
      }).templateKey,
      SPAIN_TRP_SCHEMA.templateKey,
    );
    assert.equal(
      resolveSchemaForRecord({
        status: "draft",
        answers: { [VNZH_COUNTRY_ANSWER_KEY]: "slovenia" },
      }).templateKey,
      SLOVENIA_TRP_SCHEMA.templateKey,
    );
  });

  it("Spain schema has no Croatia section and has tax / apostille fields", () => {
    assert.equal(
      SPAIN_TRP_SCHEMA.sections.some((s) => s.id === "croatia"),
      false,
    );
    const ids = SPAIN_TRP_SCHEMA.sections.flatMap((s) =>
      s.questions.map((q) => q.id),
    );
    assert.ok(ids.includes("inn_number"));
    assert.ok(ids.includes("snils_number"));
    assert.ok(ids.includes("doc_internal_id_pdf"));
    assert.ok(ids.includes("doc_criminal_record_apostille_pdf"));
    assert.equal(ids.includes("has_criminal_record_certificate"), false);
  });

  it("Slovenia schema drops only Croatia questions", () => {
    assert.equal(
      SLOVENIA_TRP_SCHEMA.sections.some((s) => s.id === "croatia"),
      false,
    );
    assert.ok(
      SLOVENIA_TRP_SCHEMA.sections.some((s) => s.id === "personal"),
    );
    assert.ok(
      SLOVENIA_TRP_SCHEMA.sections
        .flatMap((s) => s.questions.map((q) => q.id))
        .includes("has_criminal_record_certificate"),
    );
  });
});
