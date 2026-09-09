import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientContext, ResolvedClientContext } from "@/lib/ai/client-context";
import {
  LIST_QUERY_FULL_RETURN_LIMIT,
  LIST_QUERY_PAGE_SIZE,
  buildClientListFilterLabel,
  countRenderedListRows,
  findPriorStructuredListUserQuery,
  formatStructuredClientListReply,
  isClientListContinuationQuery,
  listReplyContainsSensitiveLeak,
  looksLikeStructuredClientListReply,
  parseListOffsetFromAssistantReply,
  parseReportedListCount,
  resolveTextFallbackListContinuation,
} from "@/lib/ai/client-list-reply";
import {
  EMPTY_CLIENT_SEARCH_INTENT,
  LIST_QUERY_CLIENT_LIMIT,
  LIST_QUERY_DISPLAY_LIMIT,
  isClientListQuery,
  parseClientSearchIntentRules,
} from "@/lib/ai/client-search-intent";

const REALISTIC_NAMES = [
  "Белоус Екатерина",
  "Богомазова",
  "Бронникова",
  "Васильева",
  "Громова",
  "Данилова",
  "Ершова",
  "Жукова",
  "Зайцева",
  "Игнатова",
  "Карпова",
  "Лебедева",
  "Морозова",
  "Никитина",
  "Орлова",
  "Павлова",
  "Романова",
  "Соколова",
  "Тимофеева",
  "Устинова",
  "Фёдорова",
  "Харитонова",
  "Цветкова",
  "Чернова",
  "Широкова",
  "Щербакова",
  "Андреева",
  "Борисова",
  "Власова",
  "Герасимова",
  "Демидова",
  "Емельянова",
  "Ковалёва",
  "Ларина",
  "Макарова",
  "Новикова",
  "Осипова",
  "Полякова",
  "Савельева",
  "Тарасова",
  "Фомичёва",
  "Хомякова",
  "Царёва",
  "Шестакова",
  "Юдина",
  "Яковлева",
];

function makeClient(
  index: number,
  overrides: Partial<ClientContext> = {},
): ClientContext {
  const name = REALISTIC_NAMES[index % REALISTIC_NAMES.length]!;
  const managers = ["", "Slaven Bebić", "Saša Merunka", "—"];
  const statuses = ["", "В работе", "documents review", "—"];
  return {
    source: index % 5 === 0 ? "new_clients" : "clients",
    sourceLabel: index % 5 === 0 ? "Новые клиенты" : "Клиенты",
    rowIndex: index + 2,
    name: overrides.name ?? `${name}${index >= REALISTIC_NAMES.length ? ` ${index}` : ""}`,
    phone: "",
    email: "",
    country: "Хорватия",
    direction: "Хорватия",
    status: overrides.status ?? statuses[index % statuses.length]!,
    manager: overrides.manager ?? managers[index % managers.length]!,
    lastActivity: "",
    surveyData: "",
    score: 80,
    matchedFields: [`партнер: Лена`],
    debugRow: {
      partner: "ЛЕНА МОСКВА",
      name: overrides.name ?? name,
      // Sensitive field must never appear in list projection
      appPassword: "SECRET_MUST_NOT_LEAK",
    },
    ...overrides,
  };
}

function lenaFixture(count: number): ResolvedClientContext[] {
  return Array.from({ length: count }, (_, i) => makeClient(i));
}

describe("full client list — limits and intent", () => {
  it("does not use an artificial 20-row display cap", () => {
    assert.ok(LIST_QUERY_CLIENT_LIMIT >= 100);
    assert.ok(LIST_QUERY_DISPLAY_LIMIT >= 100);
    assert.equal(LIST_QUERY_FULL_RETURN_LIMIT, 100);
    assert.equal(LIST_QUERY_PAGE_SIZE, 100);
    assert.notEqual(LIST_QUERY_DISPLAY_LIMIT, 20);
  });

  it("parses partner list queries including ё and «от партнёра»", () => {
    for (const q of [
      "Покажи клиентов от партнёра Лена",
      "покажи всех клиентов партнёра Лена",
      "Клиенты от Лены",
      "от партнёра Лены",
      "покажи клиентов Лены",
      "клиенты от партнера Лена",
      "Партнер Шарипа у каких клиентов?",
    ]) {
      const intent = parseClientSearchIntentRules(q);
      assert.equal(intent.isListQuery, true, q);
      assert.ok(intent.partnerName, q);
    }
    assert.match(
      parseClientSearchIntentRules("Покажи клиентов от партнёра Лена")
        .partnerName ?? "",
      /лена/i,
    );
  });
});

describe("full client list — formatter (46-row production-shaped fixture)", () => {
  it("reports and renders 46 rows with no 20-cap", () => {
    const clients = lenaFixture(46);
    const formatted = formatStructuredClientListReply({
      clients,
      totalFound: 46,
      filterLabel: buildClientListFilterLabel({
        ...EMPTY_CLIENT_SEARCH_INTENT,
        partnerName: "Лена",
        isListQuery: true,
      }),
      sourceQuery: "Покажи клиентов от партнёра Лена",
    });

    assert.equal(formatted.reportedCount, 46);
    assert.equal(formatted.renderedCount, 46);
    assert.equal(countRenderedListRows(formatted.reply), 46);
    assert.equal(parseReportedListCount(formatted.reply), 46);
    assert.equal(formatted.continuation, null);
    assert.match(formatted.reply, /Найдено 46/);
    assert.match(formatted.reply, /Всего: 46/);
    assert.doesNotMatch(formatted.reply, /Показано 20 из/);
    assert.match(formatted.reply, /Белоус Екатерина/);
    assert.match(formatted.reply, /46\./);
    assert.match(formatted.reply, /Клиенты/);
    assert.match(formatted.reply, /Новые клиенты/);
  });

  it("keeps reported count equal to rendered count for non-paginated replies", () => {
    for (const n of [0, 1, 20, 46, 72, 100]) {
      const formatted = formatStructuredClientListReply({
        clients: lenaFixture(n),
        totalFound: n,
        filterLabel: "от партнёра Лена",
        sourceQuery: "клиенты от Лены",
      });
      if (n === 0) {
        assert.equal(formatted.reportedCount, 0);
        assert.equal(formatted.renderedCount, 0);
        assert.match(formatted.reply, /ничего не найдено/i);
      } else {
        assert.equal(formatted.reportedCount, n);
        assert.equal(formatted.renderedCount, n);
        assert.equal(countRenderedListRows(formatted.reply), n);
      }
    }
  });

  it("Case C: 101 matches → first page 100 + continuation", () => {
    const clients = lenaFixture(101);
    const first = formatStructuredClientListReply({
      clients,
      totalFound: 101,
      filterLabel: "от партнёра Лена",
      sourceQuery: "Покажи клиентов от партнёра Лена",
    });
    assert.equal(first.reportedCount, 101);
    assert.equal(first.renderedCount, 100);
    assert.ok(first.continuation);
    assert.equal(first.continuation?.offset, 100);
    assert.equal(first.continuation?.total, 101);

    const second = formatStructuredClientListReply({
      clients,
      totalFound: 101,
      filterLabel: "от партнёра Лена",
      sourceQuery: "Покажи клиентов от партнёра Лена",
      offset: 100,
    });
    assert.equal(second.renderedCount, 1);
    assert.equal(second.continuation, null);
    assert.equal(parseReportedListCount(second.reply), 101);
  });

  it("Case D: 235 matches paginate 100+100+35 without duplicates or skips", () => {
    const clients = lenaFixture(235);
    const pages = [0, 100, 200].map((offset) =>
      formatStructuredClientListReply({
        clients,
        totalFound: 235,
        filterLabel: "от партнёра Лена",
        sourceQuery: "Покажи клиентов от партнёра Лена",
        offset,
      }),
    );
    assert.equal(pages[0]!.renderedCount, 100);
    assert.equal(pages[1]!.renderedCount, 100);
    assert.equal(pages[2]!.renderedCount, 35);
    assert.ok(pages[0]!.continuation);
    assert.ok(pages[1]!.continuation);
    assert.equal(pages[2]!.continuation, null);

    const names: string[] = [];
    for (const page of pages) {
      for (const line of page.reply.split("\n")) {
        const m = line.match(/^\d+\.\s+(.+?)\s+—/);
        if (m?.[1]) names.push(m[1]);
      }
    }
    assert.equal(names.length, 235);
    assert.equal(new Set(names).size, 235);
    // Stable order across pages: concatenated names match full sort
    const full = formatStructuredClientListReply({
      clients,
      totalFound: 235,
      filterLabel: "от партнёра Лена",
      sourceQuery: "x",
      pageSize: 235,
    });
    const fullNames = [...full.reply.matchAll(/^\d+\.\s+(.+?)\s+—/gm)].map(
      (m) => m[1]!,
    );
    assert.deepEqual(names, fullNames);
  });

  it("includes both Клиенты and Новые клиенты without inventing rows", () => {
    const clients = lenaFixture(10);
    const formatted = formatStructuredClientListReply({
      clients,
      totalFound: 10,
      filterLabel: "от партнёра Лена",
      sourceQuery: "Покажи клиентов от партнёра Лена",
    });
    assert.match(formatted.reply, /Клиенты/);
    assert.match(formatted.reply, /Новые клиенты/);
    assert.equal(countRenderedListRows(formatted.reply), 10);
  });

  it("does not leak sensitive fields", () => {
    const formatted = formatStructuredClientListReply({
      clients: lenaFixture(5),
      totalFound: 5,
      filterLabel: "от партнёра Лена",
      sourceQuery: "Покажи клиентов от партнёра Лена",
    });
    assert.equal(listReplyContainsSensitiveLeak(formatted.reply), false);
    assert.doesNotMatch(formatted.reply, /SECRET_MUST_NOT_LEAK/);
    assert.doesNotMatch(formatted.reply, /appPassword/i);
    assert.doesNotMatch(formatted.reply, /password|token|credentials/i);
  });

  it("paginates only above the full-return ceiling and preserves offset", () => {
    const total = LIST_QUERY_FULL_RETURN_LIMIT + 20;
    const clients = lenaFixture(total);
    const first = formatStructuredClientListReply({
      clients,
      totalFound: total,
      filterLabel: "от партнёра Лена",
      sourceQuery: "Покажи клиентов от партнёра Лена",
      offset: 0,
    });
    assert.equal(first.reportedCount, total);
    assert.equal(first.renderedCount, LIST_QUERY_FULL_RETURN_LIMIT);
    assert.ok(first.continuation);
    assert.equal(first.continuation?.offset, LIST_QUERY_FULL_RETURN_LIMIT);
    assert.equal(first.continuation?.total, total);
    assert.equal(first.continuation?.sourceQuery, "Покажи клиентов от партнёра Лена");

    const second = formatStructuredClientListReply({
      clients,
      totalFound: total,
      filterLabel: "от партнёра Лена",
      sourceQuery: "Покажи клиентов от партнёра Лена",
      offset: first.continuation!.offset,
    });
    assert.equal(second.renderedCount, 20);
    assert.equal(parseListOffsetFromAssistantReply(first.reply), LIST_QUERY_FULL_RETURN_LIMIT);
    assert.match(second.reply, new RegExp(`${LIST_QUERY_FULL_RETURN_LIMIT + 1}\\.`));
    assert.equal(second.continuation, null);
  });
});

describe("full client list — follow-up continuity", () => {
  it("detects continuation phrases", () => {
    for (const q of [
      "давай следующих",
      "давай следующего",
      "дальше",
      "ещё",
      "еще",
      "следующие",
      "покажи ещё",
      "продолжай",
    ]) {
      assert.equal(isClientListContinuationQuery(q), true, q);
    }
    assert.equal(
      isClientListContinuationQuery("Покажи клиентов от партнёра Лена"),
      false,
    );
  });

  it("Case F: independent new query is not treated as continuation", () => {
    assert.equal(
      isClientListContinuationQuery("Какой адрес букинга у Антоновой?"),
      false,
    );
    assert.equal(
      isClientListContinuationQuery("Покажи клиентов от партнёра Шарипа"),
      false,
    );
  });

  it("recovers prior list filter from history for continuation", () => {
    const prior = "Покажи клиентов от партнёра Лена";
    const history = [
      { role: "user", content: prior },
      {
        role: "assistant",
        content:
          "Найдено 120 клиентов и заявок от партнёра Лена.\n\n1. A — статус не указан — менеджер не указан\n\nПоказано 100 из 120. Напишите «следующие»…\nВсего: 120",
      },
      { role: "user", content: "давай следующих" },
    ];
    assert.equal(findPriorStructuredListUserQuery(history), prior);
    assert.equal(
      parseListOffsetFromAssistantReply(history[1]!.content),
      100,
    );
  });

  it("does not resume singular client lookup on «ещё»", () => {
    const history = [
      { role: "user", content: "покажи клиента Антонова" },
      { role: "assistant", content: "Антонова — …" },
      { role: "user", content: "ещё" },
    ];
    assert.equal(findPriorStructuredListUserQuery(history), null);
  });

  it("235-row history continuation: 100 → давай следующих → 100 → ещё → 35", () => {
    const prior = "Покажи клиентов от партнёра Лена";
    const clients = lenaFixture(235);
    const page1 = formatStructuredClientListReply({
      clients,
      totalFound: 235,
      filterLabel: "от партнёра Лена",
      sourceQuery: prior,
      offset: 0,
    });
    assert.equal(page1.renderedCount, 100);
    assert.equal(page1.continuation?.offset, 100);

    const histAfter1 = [
      { role: "user", content: prior },
      { role: "assistant", content: page1.reply },
      { role: "user", content: "давай следующих" },
    ];
    assert.equal(findPriorStructuredListUserQuery(histAfter1), prior);
    assert.equal(parseListOffsetFromAssistantReply(page1.reply), 100);

    const page2 = formatStructuredClientListReply({
      clients,
      totalFound: 235,
      filterLabel: "от партнёра Лена",
      sourceQuery: prior,
      offset: parseListOffsetFromAssistantReply(page1.reply),
    });
    assert.equal(page2.renderedCount, 100);
    assert.equal(page2.continuation?.offset, 200);

    const histAfter2 = [
      { role: "user", content: prior },
      { role: "assistant", content: page1.reply },
      { role: "user", content: "давай следующих" },
      { role: "assistant", content: page2.reply },
      { role: "user", content: "ещё" },
    ];
    assert.equal(isClientListContinuationQuery("ещё"), true);
    assert.equal(findPriorStructuredListUserQuery(histAfter2), prior);
    assert.equal(parseListOffsetFromAssistantReply(page2.reply), 200);

    const page3 = formatStructuredClientListReply({
      clients,
      totalFound: 235,
      filterLabel: "от партнёра Лена",
      sourceQuery: prior,
      offset: 200,
    });
    assert.equal(page3.renderedCount, 35);
    assert.equal(page3.continuation, null);
  });

  it("text fallback resumes only while last assistant is still a list page", () => {
    const prior = "Покажи клиентов от партнёра Лена";
    const listReply =
      "Найдено 235 клиентов и заявок от партнёра Лена.\n\n1. A — s — m\n\nПоказано 100 из 235.\nВсего: 235";
    const afterList = [
      { role: "user", content: prior },
      { role: "assistant", content: listReply },
    ];
    assert.equal(looksLikeStructuredClientListReply(listReply), true);
    assert.deepEqual(resolveTextFallbackListContinuation(afterList, "ещё"), {
      sourceQuery: prior,
      offset: 100,
    });

    const afterWeather = [
      ...afterList,
      { role: "user", content: "Какая погода?" },
      { role: "assistant", content: "Завтра солнечно." },
    ];
    assert.equal(
      resolveTextFallbackListContinuation(afterWeather, "ещё"),
      null,
    );

    const afterSingular = [
      ...afterList,
      { role: "user", content: "Найди клиента Иван" },
      { role: "assistant", content: "Иван — статус не указан — менеджер не указан" },
    ];
    assert.equal(
      resolveTextFallbackListContinuation(afterSingular, "ещё"),
      null,
    );
  });

  it("offset past resolved total clears continuation without claiming empty filter", () => {
    const clients = lenaFixture(50);
    const formatted = formatStructuredClientListReply({
      clients,
      totalFound: 50,
      filterLabel: "от партнёра Лена",
      sourceQuery: "Покажи клиентов от партнёра Лена",
      offset: 100,
    });
    assert.equal(formatted.renderedCount, 0);
    assert.equal(formatted.continuation, null);
    assert.equal(formatted.reportedCount, 50);
    assert.match(formatted.reply, /уже показан полностью/i);
    assert.doesNotMatch(formatted.reply, /ничего не найдено/i);
  });
});
