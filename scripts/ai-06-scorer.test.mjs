/**
 * Unit tests for AI-06 evaluation scorer robustness (eval-only).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  answerContainsMoneyFact,
  moneyFactsEquivalent,
  parseMoneyFact,
  normalizeUnicodeWhitespace,
  hasUncertaintyLanguage,
  hasDefinitiveUnsupportedMissing,
  includesFact,
  scoreAnswer,
  INCOME_A,
} from "./ai-06-scorer.mjs";

describe("ai-06 monetary normalization", () => {
  it("equates €2,300 with spaced and EUR forms", () => {
    assert.equal(answerContainsMoneyFact("минимум €2 300 в месяц", INCOME_A), true);
    assert.equal(answerContainsMoneyFact("минимум 2 300 €", INCOME_A), true);
    assert.equal(answerContainsMoneyFact("минимум EUR 2300", INCOME_A), true);
    assert.equal(answerContainsMoneyFact("минимум €2300", INCOME_A), true);
    assert.equal(answerContainsMoneyFact("минимум €2,300", INCOME_A), true);
  });

  it("rejects different values and currencies", () => {
    assert.equal(answerContainsMoneyFact("минимум €23,000", INCOME_A), false);
    assert.equal(answerContainsMoneyFact("минимум $2,300", INCOME_A), false);
    assert.equal(answerContainsMoneyFact("минимум €2,3000", INCOME_A), false);
  });

  it("rejects mismatched periods when both sides specify period", () => {
    const month = parseMoneyFact("€2,300/month");
    const year = parseMoneyFact("€2,300/year");
    assert.equal(moneyFactsEquivalent(month, year), false);
    assert.equal(
      answerContainsMoneyFact("income is €2,300 per year", "€2,300/month"),
      false,
    );
    assert.equal(
      answerContainsMoneyFact("income is €2,300 per month", "€2,300/month"),
      true,
    );
  });

  it("normalizes Unicode NBSP / narrow NBSP thousands separators", () => {
    const nbsp = `€2\u00A0300`;
    const nnbsp = `€2\u202F300`;
    assert.equal(normalizeUnicodeWhitespace(nbsp).includes("2 300"), true);
    assert.equal(answerContainsMoneyFact(`сумма ${nbsp}`, INCOME_A), true);
    assert.equal(answerContainsMoneyFact(`сумма ${nnbsp}`, INCOME_A), true);
  });

  it("includesFact routes money facts through normalization", () => {
    assert.equal(includesFact("Доход — **€2 300** в месяц", INCOME_A), true);
    assert.equal(includesFact("Passport.pdf загружен", "Passport"), true);
  });
});

describe("ai-06 uncertainty language", () => {
  it("accepts equivalent uncertainty phrases", () => {
    assert.equal(hasUncertaintyLanguage("не удалось подтвердить требуемый доход"), true);
    assert.equal(hasUncertaintyLanguage("данных недостаточно для ответа"), true);
    assert.equal(hasUncertaintyLanguage("не найдено в доступных данных"), true);
    assert.equal(hasUncertaintyLanguage("cannot verify from retrieved evidence"), true);
  });

  it("does not treat bare definitive missing as uncertainty", () => {
    assert.equal(hasUncertaintyLanguage("у клиента нет справки"), false);
    assert.equal(hasDefinitiveUnsupportedMissing("у клиента нет справки"), true);
    assert.equal(hasDefinitiveUnsupportedMissing("документа нет"), true);
  });

  it("scores NOT_FOUND definitive missing as fail; KNOWN_MISSING allowed", () => {
    const notFoundCase = {
      requireUncertainty: true,
      contextBlock: "proof of income: NOT_FOUND_IN_RETRIEVED_CONTEXT",
      mustInclude: [],
      mustNotInclude: [],
    };
    const knownCase = {
      requireUncertainty: true,
      contextBlock: "proof of income: KNOWN_MISSING",
      mustInclude: [],
      mustNotInclude: [],
    };

    const failDims = scoreAnswer(
      notFoundCase,
      "У клиента нет справки о доходах.",
      [],
    );
    assert.equal(failDims.uncertaintyCorrect, false);
    assert.equal(failDims.criticalFalseMissing, true);

    const okDims = scoreAnswer(
      knownCase,
      "У клиента нет справки о доходах (KNOWN_MISSING).",
      [],
    );
    assert.equal(okDims.uncertaintyCorrect, true);
    assert.equal(okDims.criticalFalseMissing, false);

    const uncertainOk = scoreAnswer(
      notFoundCase,
      "Не удалось подтвердить наличие справки в извлечённом контексте.",
      [],
    );
    assert.equal(uncertainOk.uncertaintyCorrect, true);
    assert.equal(uncertainOk.criticalFalseMissing, false);
  });
});
