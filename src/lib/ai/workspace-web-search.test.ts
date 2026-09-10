import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldUseInternetSearch,
} from "@/lib/ai/workspace-web-search";

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
      shouldUseInternetSearch("Какие документы нужны для Digital Nomad в Хорватии?"),
      false,
    );
  });
});
