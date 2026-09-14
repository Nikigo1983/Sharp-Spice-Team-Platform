import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatFinanceDebtorsListReply,
  isFinancePaymentDebtQuery,
  NO_CONTRACT_YET_LABEL,
} from "@/lib/ai/finance-debt-query";

describe("isFinancePaymentDebtQuery", () => {
  it("detects debtor payment questions", () => {
    assert.equal(isFinancePaymentDebtQuery("кто должник по оплате"), true);
    assert.equal(isFinancePaymentDebtQuery("Покажи должников"), true);
    assert.equal(isFinancePaymentDebtQuery("кто должен по оплате"), true);
    assert.equal(isFinancePaymentDebtQuery("неоплаченные договоры"), true);
  });

  it("ignores unrelated queries", () => {
    assert.equal(isFinancePaymentDebtQuery("кто в работе"), false);
    assert.equal(isFinancePaymentDebtQuery("статус адрес отправлен"), false);
    assert.equal(isFinancePaymentDebtQuery("клиенты менеджера Лена"), false);
  });
});

describe("formatFinanceDebtorsListReply", () => {
  it("says no contract when Finance has no amounts", () => {
    const reply = formatFinanceDebtorsListReply({
      debtors: [],
      totalCases: 5,
      withContract: 0,
      withoutContract: 5,
    });
    assert.match(reply, new RegExp(NO_CONTRACT_YET_LABEL));
    assert.match(reply, /пока нет договоров с суммой/i);
  });

  it("lists debtors with balances", () => {
    const reply = formatFinanceDebtorsListReply({
      debtors: [
        {
          name: "Иванов",
          balance: "500,00 €",
          contractAmount: "1 000,00 €",
          paidAmount: "500,00 €",
        },
      ],
      totalCases: 3,
      withContract: 2,
      withoutContract: 1,
    });
    assert.match(reply, /Найдено 1 должник/i);
    assert.match(reply, /Иванов/);
    assert.match(reply, /500,00 €/);
  });
});
