import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldUseInternetSearch,
  searchWebForWorkspace,
  isExternalWebSearchAllowedForClientPiiTask,
} from "@/lib/ai/workspace-web-search";
import { queryLooksLikeClientPii } from "@/lib/ai/client-pii-signals";

describe("workspace web search intent", () => {
  it("enables internet for explicit / currency asks", () => {
    assert.equal(
      shouldUseInternetSearch(
        "Проверь в интернете актуальные требования Digital Nomad в Хорватии на сегодня",
      ),
      true,
    );
    assert.equal(
      shouldUseInternetSearch("Какие новые требования на 2026 для ВНЖ Хорватии?"),
      true,
    );
    assert.equal(shouldUseInternetSearch("Найди official site MUP Croatia"), true);
  });

  it("keeps internet last — skips CRM / fill / lists", () => {
    assert.equal(
      shouldUseInternetSearch("Какой паспорт у Ивана Иванова?"),
      false,
    );
    assert.equal(
      shouldUseInternetSearch("Собери данные для заполнения заявления по Иванову"),
      false,
    );
    assert.equal(
      shouldUseInternetSearch("Покажи список клиентов в работе"),
      false,
    );
    assert.equal(
      shouldUseInternetSearch(
        "Проверь в интернете email клиента Иванова и его паспорт",
      ),
      false,
    );
    assert.equal(
      shouldUseInternetSearch("Сколько должна Коровякова?"),
      false,
    );
  });

  it("blocks client-PII queries even with explicit internet wording", async () => {
    assert.equal(isExternalWebSearchAllowedForClientPiiTask(), false);
    assert.equal(queryLooksLikeClientPii("Найди в интернете email Ивановой"), true);
    assert.equal(
      shouldUseInternetSearch("Найди в интернете email Ивановой"),
      false,
    );
    const blocked = await searchWebForWorkspace(
      "Найди в интернете телефон Тестова + паспорт",
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, "CLIENT_PII_WEB_SEARCH_BLOCKED");
    assert.equal(blocked.query, "");
    assert.equal(blocked.hits.length, 0);
  });
});
