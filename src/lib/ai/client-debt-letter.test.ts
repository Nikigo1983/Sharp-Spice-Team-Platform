import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractClientNameFromLetterQuery,
  formatDebtReminderLetter,
  isClientDebtReminderLetterQuery,
} from "@/lib/ai/client-debt-letter";
import {
  clipHistoryTurnsForModel,
  WORKSPACE_HISTORY_TURN_MAX_CHARS,
} from "@/lib/ai/workspace-conversation-memory";

describe("isClientDebtReminderLetterQuery", () => {
  it("detects debt reminder letter requests", () => {
    assert.equal(
      isClientDebtReminderLetterQuery(
        "Ты можешь написать письмо коровяковой, что ее процесс по получению ВНЖ подходит к концу и ей нужно оплатить долг. Напиши красиво деликатно",
      ),
      true,
    );
    assert.equal(
      isClientDebtReminderLetterQuery("напиши сообщение клиенту про оплату долга"),
      true,
    );
    assert.equal(isClientDebtReminderLetterQuery("какой долг у Коровяковой"), false);
    assert.equal(isClientDebtReminderLetterQuery("напиши письмо с поздравлением"), false);
  });
});

describe("extractClientNameFromLetterQuery", () => {
  it("extracts surname from letter request", () => {
    assert.equal(
      extractClientNameFromLetterQuery(
        "Ты можешь написать письмо коровяковой, что ее процесс",
      ),
      "коровяковой",
    );
  });
});

describe("formatDebtReminderLetter", () => {
  it("builds a delicate letter with balance", () => {
    const letter = formatDebtReminderLetter({
      displayName: "КОРОВЯКОВА",
      email: "s.korovyakova@gmail.com",
      contractAmount: "2 000 €",
      contractAmountCents: 200000,
      paidAmount: "1 000 €",
      balance: "1 000 €",
      balanceCents: 100000,
      nameHint: "коровяковой",
      mentionResidencePermit: true,
    });
    assert.match(letter, /Уважаемая Коровякова/i);
    assert.match(letter, /ВНЖ/);
    assert.match(letter, /1 000 €/);
    assert.match(letter, /s\.korovyakova@gmail\.com/);
    assert.match(letter, /Sharp & Spice/);
  });
});

describe("clipHistoryTurnsForModel", () => {
  it("truncates giant debtor lists", () => {
    const huge = "x".repeat(WORKSPACE_HISTORY_TURN_MAX_CHARS + 500);
    const clipped = clipHistoryTurnsForModel([
      { role: "assistant", content: huge },
    ]);
    assert.ok((clipped[0]!.content?.length ?? 0) < huge.length);
    assert.match(clipped[0]!.content ?? "", /сокращено/);
  });
});
