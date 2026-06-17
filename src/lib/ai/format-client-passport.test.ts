import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPassportLookupReply,
  looksLikePassportNumber,
} from "@/lib/ai/format-client";

describe("looksLikePassportNumber", () => {
  it("accepts passport with digits", () => {
    assert.equal(looksLikePassportNumber("КВ2719292"), true);
    assert.equal(looksLikePassportNumber("776062742"), true);
  });

  it("rejects latin full name mistaken as passport", () => {
    assert.equal(looksLikePassportNumber("Belavus Katsiaryna"), false);
  });
});

describe("formatPassportLookupReply", () => {
  it("formats a single-line manager answer", () => {
    assert.equal(
      formatPassportLookupReply("Белоус Екатерина", "КВ2719292", 7),
      "**КВ2719292** — паспорт Белоус Екатерина · таблица «Клиенты» · строка 7",
    );
  });
});

describe("formatClientForAi", () => {
  it("includes latin, partner and contract fields", async () => {
    const { formatClientForAi } = await import("@/lib/ai/format-client");
    const text = formatClientForAi({
      id: "КВ2719292",
      name: "Белоус Екатерина",
      phone: "—",
      email: "—",
      country: "Хорватия",
      citizenship: "Belavus Katsiaryna",
      direction: "Хорватия",
      status: "—",
      manager: "—",
      lastActivity: "—",
      createdAt: "—",
      passportNumber: "КВ2719292",
      partnerName: "ЛЕНА МОСКВА",
      contract: "дог.оказания услуг",
    });
    assert.match(text, /Латиница: Belavus Katsiaryna/);
    assert.match(text, /Партнер от кого клиент: ЛЕНА МОСКВА/);
    assert.match(text, /Договор: дог\.оказания услуг/);
  });
});
