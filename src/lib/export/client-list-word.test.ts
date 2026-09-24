import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClientListWordDoc,
  clientListWordFilename,
} from "./client-list-word.ts";

describe("client-list-word", () => {
  it("builds a Word-compatible HTML table from headers and rows", () => {
    const html = buildClientListWordDoc({
      title: "Клиенты — июль 2026",
      subtitle: "Фильтр: дата подачи = июль",
      headers: ["Клиент", "Email"],
      rows: [
        ["Иванов Иван", "a@example.com"],
        ["<script>", "b@example.com"],
      ],
      generatedAt: new Date("2026-09-24T12:00:00Z"),
    });
    assert.match(html, /Клиенты — июль 2026/);
    assert.match(html, /Записей: <strong>2<\/strong>/);
    assert.match(html, /<th>Клиент<\/th>/);
    assert.match(html, /Иванов Иван/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /application\/msword|WordDocument|urn:schemas-microsoft-com:office:word/);
  });

  it("slugifies filenames safely", () => {
    assert.equal(
      clientListWordFilename("Список клиентов", new Date("2026-07-15T00:00:00Z")),
      "Список-клиентов-2026-07-15.doc",
    );
  });
});
