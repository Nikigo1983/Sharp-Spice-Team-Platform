import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isClientListContinuationQuery,
  resolveClientListContinuationFromHistory,
  sanitizeClientListContinuation,
} from "@/lib/ai/client-list-continuation";

describe("client list continuation round-trip helpers", () => {
  const page1Meta = {
    sourceQuery: "Покажи клиентов от партнёра Лена",
    offset: 100,
    total: 235,
    filterSummary: "от партнёра Лена",
  };

  it("A/B: resolves structured meta from prior assistant turn for continuation phrases", () => {
    const history = [
      { role: "user", content: page1Meta.sourceQuery },
      {
        role: "assistant",
        content: "Найдено 235…\nПоказано 100 из 235",
        clientListContinuation: page1Meta,
      },
    ];
    for (const phrase of ["давай следующих", "ещё", "дальше", "продолжай"]) {
      const resolved = resolveClientListContinuationFromHistory(history, phrase);
      assert.deepEqual(resolved, {
        sourceQuery: page1Meta.sourceQuery,
        offset: 100,
        total: 235,
        filterSummary: page1Meta.filterSummary,
      });
    }
  });

  it("C: structured meta preferred — text alone is not required when meta present", () => {
    const history = [
      { role: "user", content: page1Meta.sourceQuery },
      {
        role: "assistant",
        content: "Список без текстового маркера пагинации",
        clientListContinuation: page1Meta,
      },
    ];
    const resolved = resolveClientListContinuationFromHistory(
      history,
      "давай следующих",
    );
    assert.equal(resolved?.offset, 100);
    assert.equal(resolved?.total, 235);
  });

  it("F: new non-continuation query does not resolve continuation", () => {
    const history = [
      { role: "user", content: page1Meta.sourceQuery },
      {
        role: "assistant",
        content: "page1",
        clientListContinuation: page1Meta,
      },
    ];
    assert.equal(
      resolveClientListContinuationFromHistory(
        history,
        "Какая погода завтра?",
      ),
      null,
    );
  });

  it("F/G: unrelated assistant reply invalidates list continuation for «ещё»", () => {
    const history = [
      { role: "user", content: page1Meta.sourceQuery },
      {
        role: "assistant",
        content: "page1",
        clientListContinuation: page1Meta,
      },
      { role: "user", content: "Какая погода завтра?" },
      { role: "assistant", content: "Завтра солнечно." },
    ];
    assert.equal(
      resolveClientListContinuationFromHistory(history, "ещё"),
      null,
    );
  });

  it("G: «ещё» without prior list meta does not paginate", () => {
    assert.equal(
      resolveClientListContinuationFromHistory(
        [
          { role: "user", content: "Минимальный доход digital nomad?" },
          { role: "assistant", content: "€2300…" },
        ],
        "ещё",
      ),
      null,
    );
  });

  it("H: malformed/tampered meta rejected", () => {
    assert.equal(sanitizeClientListContinuation(null), null);
    assert.equal(sanitizeClientListContinuation({}), null);
    assert.equal(
      sanitizeClientListContinuation({
        sourceQuery: "",
        offset: 0,
        total: 10,
      }),
      null,
    );
    assert.equal(
      sanitizeClientListContinuation({
        sourceQuery: "x",
        offset: -1,
        total: 10,
      }),
      null,
    );
    assert.equal(
      sanitizeClientListContinuation({
        sourceQuery: "x",
        offset: 0,
        total: 999999,
      }),
      null,
    );
    const sanitized = sanitizeClientListContinuation({
      sourceQuery: "Покажи клиентов от партнёра Лена",
      offset: 100,
      total: 235,
      appPassword: "nope",
      clients: [{ name: "A" }],
    });
    assert.ok(sanitized);
    assert.equal(sanitized.sourceQuery, "Покажи клиентов от партнёра Лена");
    assert.equal(sanitized.offset, 100);
    assert.equal(sanitized.total, 235);
    assert.equal("appPassword" in sanitized, false);
    assert.equal("clients" in sanitized, false);
  });

  it("D continuity across pages keeps same sourceQuery", () => {
    assert.equal(isClientListContinuationQuery("давай следующих"), true);
    const afterPage1 = [
      { role: "user", content: page1Meta.sourceQuery },
      {
        role: "assistant",
        content: "page1",
        clientListContinuation: page1Meta,
      },
    ];
    const c1 = resolveClientListContinuationFromHistory(
      afterPage1,
      "давай следующих",
    );
    assert.equal(c1?.offset, 100);

    const afterPage2 = [
      ...afterPage1,
      { role: "user", content: "давай следующих" },
      {
        role: "assistant",
        content: "page2",
        clientListContinuation: {
          sourceQuery: page1Meta.sourceQuery,
          offset: 200,
          total: 235,
        },
      },
    ];
    const c2 = resolveClientListContinuationFromHistory(afterPage2, "ещё");
    assert.equal(c2?.offset, 200);
    assert.equal(c2?.sourceQuery, page1Meta.sourceQuery);

    const afterPage3 = [
      ...afterPage2,
      { role: "user", content: "ещё" },
      { role: "assistant", content: "page3 last 35" },
    ];
    assert.equal(
      resolveClientListContinuationFromHistory(afterPage3, "ещё"),
      null,
    );
  });
});
