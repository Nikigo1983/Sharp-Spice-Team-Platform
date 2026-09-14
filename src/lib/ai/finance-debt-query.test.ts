import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatFinanceDebtorsListReply,
  isFinancePaymentDebtQuery,
  NO_CONTRACT_YET_LABEL,
  wantsDebtorEmails,
} from "@/lib/ai/finance-debt-query";

describe("isFinancePaymentDebtQuery", () => {
  it("detects debtor payment questions", () => {
    assert.equal(isFinancePaymentDebtQuery("кто должник по оплате"), true);
    assert.equal(isFinancePaymentDebtQuery("Покажи должников"), true);
    assert.equal(isFinancePaymentDebtQuery("кто должен по оплате"), true);
    assert.equal(isFinancePaymentDebtQuery("неоплаченные договоры"), true);
    assert.equal(
      isFinancePaymentDebtQuery("какие емейлы у должников чтобы им написать"),
      true,
    );
  });

  it("ignores unrelated queries", () => {
    assert.equal(isFinancePaymentDebtQuery("кто в работе"), false);
    assert.equal(isFinancePaymentDebtQuery("статус адрес отправлен"), false);
    assert.equal(isFinancePaymentDebtQuery("клиенты менеджера Лена"), false);
  });
});

describe("wantsDebtorEmails", () => {
  it("detects email requests for debtors", () => {
    assert.equal(
      wantsDebtorEmails("какие емейлы у должников чтобы им написать"),
      true,
    );
    assert.equal(wantsDebtorEmails("email должников"), true);
    assert.equal(wantsDebtorEmails("кто должник по оплате"), false);
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

  it("lists debtors with emails and balances", () => {
    const reply = formatFinanceDebtorsListReply({
      debtors: [
        {
          name: "Иванов",
          email: "ivanov@example.com",
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
    assert.match(reply, /ivanov@example.com/);
    assert.match(reply, /500,00 €/);
  });

  it("focuses emails when requested", () => {
    const reply = formatFinanceDebtorsListReply({
      debtors: [
        {
          name: "Иванов",
          email: "ivanov@example.com",
          balance: "500 €",
          contractAmount: "1000 €",
          paidAmount: "500 €",
        },
        {
          name: "Петров",
          email: null,
          balance: "200 €",
          contractAmount: "200 €",
          paidAmount: "0 €",
        },
      ],
      totalCases: 2,
      withContract: 2,
      withoutContract: 0,
      focusEmails: true,
    });
    assert.match(reply, /Email должников/i);
    assert.match(reply, /из них с email: 1/);
    assert.match(reply, /ivanov@example.com/);
    assert.match(reply, /email не указан в заявке/);
  });
});
