import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractNameFromDebtQuery,
  formatFinanceClientDebtReply,
  formatFinanceDebtorsListReply,
  isFinanceDebtFollowUpQuery,
  isFinanceNamedClientDebtQuery,
  isFinancePaymentDebtQuery,
  NO_CONTRACT_YET_LABEL,
  resolveFinanceDebtNameHint,
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

  it("ignores unrelated and named-client debt queries", () => {
    assert.equal(isFinancePaymentDebtQuery("кто в работе"), false);
    assert.equal(isFinancePaymentDebtQuery("статус адрес отправлен"), false);
    assert.equal(isFinancePaymentDebtQuery("клиенты менеджера Лена"), false);
    assert.equal(
      isFinancePaymentDebtQuery("Скажи какой долг у Мазуриной"),
      false,
    );
  });
});

describe("isFinanceNamedClientDebtQuery", () => {
  it("detects named debt questions", () => {
    assert.equal(
      isFinanceNamedClientDebtQuery("Скажи какой долг у Мазуриной"),
      true,
    );
    assert.equal(isFinanceNamedClientDebtQuery("долг у Ивановой"), true);
    assert.equal(isFinanceNamedClientDebtQuery("сколько должна Петрова"), true);
  });

  it("extracts the client name", () => {
    assert.equal(
      extractNameFromDebtQuery("Скажи какой долг у Мазуриной"),
      "Мазуриной",
    );
    assert.equal(extractNameFromDebtQuery("долг у Ивановой"), "Ивановой");
  });
});

describe("finance debt follow-ups", () => {
  it("detects «А у Пермяковой?» style follow-ups", () => {
    assert.equal(isFinanceDebtFollowUpQuery("А у Пермяковой?"), true);
    assert.equal(isFinanceDebtFollowUpQuery("у Ивановой"), true);
    assert.equal(isFinanceDebtFollowUpQuery("а Петрова"), true);
    assert.equal(isFinanceDebtFollowUpQuery("кто должник по оплате"), false);
    assert.equal(isFinanceDebtFollowUpQuery("какой долг у Мазуриной"), false);
  });

  it("resolves name from follow-up only with debt context in history", () => {
    const history = [
      { role: "user", content: "Скажи какой долг у Мазуриной" },
      {
        role: "assistant",
        content:
          "У **МАЗУРИНА** долг **1 000 €** (договор 2 000 €, оплачено 1 000 €). Источник: Finance + Заявки портала Emigrant.",
      },
    ];
    assert.equal(
      resolveFinanceDebtNameHint("А у Пермяковой?", history),
      "Пермяковой",
    );
    assert.equal(resolveFinanceDebtNameHint("А у Пермяковой?", []), null);
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

describe("formatFinanceClientDebtReply", () => {
  it("says пока нет договора when no Finance amount", () => {
    const reply = formatFinanceClientDebtReply({
      name: "Мазурина",
      email: "m@example.com",
      contractAmount: null,
      contractAmountCents: null,
      paidAmount: null,
      balance: null,
      balanceCents: null,
    });
    assert.match(reply, /Мазурина/);
    assert.match(reply, new RegExp(NO_CONTRACT_YET_LABEL));
    assert.match(reply, /m@example.com/);
  });

  it("reports outstanding balance", () => {
    const reply = formatFinanceClientDebtReply({
      name: "Мазурина",
      email: null,
      contractAmount: "2 000 €",
      contractAmountCents: 200000,
      paidAmount: "1 000 €",
      balance: "1 000 €",
      balanceCents: 100000,
    });
    assert.match(reply, /долг \*\*1 000 €\*\*/);
  });
});
