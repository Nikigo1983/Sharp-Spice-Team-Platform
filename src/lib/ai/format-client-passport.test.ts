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

  it("includes submission, approval and residence card dates", async () => {
    const { formatClientForAi, buildCrmClientDebugRow } = await import(
      "@/lib/ai/format-client"
    );
    const client = {
      id: "КВ2719292",
      name: "Белоус Екатерина",
      phone: "—",
      email: "anna@example.com",
      country: "Хорватия",
      citizenship: "Belavus Katsiaryna",
      direction: "Хорватия",
      status: "—",
      manager: "Злата",
      lastActivity: "—",
      createdAt: "01.01.2025",
      passportNumber: "КВ2719292",
      submittedAt: "15.03.2025",
      expectedApprovalAt: "20.06.2025",
      approvalAt: "18.06.2025",
      residenceCardIssuedAt: "01.07.2025",
      referentName: "Злата",
      bookingAddress: "Zagreb",
      bookingRange: "10.06–12.06",
      notes: "Ждёт карту",
    };
    const text = formatClientForAi(client);
    assert.match(text, /Дата подачи: 15\.03\.2025/);
    assert.match(text, /Предполагаемое одобрение: 20\.06\.2025/);
    assert.match(text, /Дата одобрения ВНЖ: 18\.06\.2025/);
    assert.match(text, /Дата выдачи карточки ВНЖ: 01\.07\.2025/);
    assert.match(text, /Имя референта: Злата/);

    const debugRow = buildCrmClientDebugRow(client);
    assert.equal(debugRow.submittedAt, "15.03.2025");
    assert.equal(debugRow.residenceCardIssuedAt, "01.07.2025");
  });
});
