import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCroatiaExternalClientsRows } from "@/lib/google-sheets/parse";

/** Актуальная шапка вкладки External (production CSV). */
const EXTERNAL_HEADERS = [
  "Фамилия",
  "Латиница",
  "Номер паспорта",
  "электронная почта",
  "Дата подачи",
  "Дата предпологаемого одобрения",
  "Имя референта",
  "Адрес букинга",
  "Дата букинга (от и до)",
  "Дата одобрения ВНЖ",
  "Заметки",
  "Дата выдачи карточки ВНЖ",
  "Пароль для приложения",
  "Партнер от кого клиент",
  "Договор",
];

describe("parseCroatiaExternalClientsRows", () => {
  it("parses latin, passport, email and partner columns", () => {
    const rows = [
      EXTERNAL_HEADERS,
      [
        "Белоус Екатерина",
        "Belavus Katsiaryna",
        "КВ2719292",
        "belavus@example.com",
        "01.04.2026",
        "",
        "",
        "Ivana Tkalčića 34",
        "04.08-11.08",
        "",
        "",
        "",
        "L@HF#fNfyxeX",
        "ЛЕНА МОСКВА",
        "дог.оказания услуг",
      ],
    ];

    const [client] = parseCroatiaExternalClientsRows(rows);
    assert.equal(client.name, "Белоус Екатерина");
    assert.equal(client.citizenship, "Belavus Katsiaryna");
    assert.equal(client.passportNumber, "КВ2719292");
    assert.equal(client.email, "belavus@example.com");
    assert.equal(client.id, "КВ2719292");
    assert.equal(client.createdAt, "01.04.2026");
    assert.equal(client.partnerName, "ЛЕНА МОСКВА");
    assert.equal(client.contract, "дог.оказания услуг");
  });

  it("parses numeric passport for another row", () => {
    const rows = [
      EXTERNAL_HEADERS,
      [
        "АКУНОВ",
        "Akunov",
        "АС3522461",
        "",
        "10.03.2026",
        "",
        "",
        "Karamanov prilaz 2",
        "12.06-14.06",
        "",
        "",
        "",
        "XLFKDrP3A57y",
        "ШАРИПА",
        "дог.оказания услуг",
      ],
    ];

    const [client] = parseCroatiaExternalClientsRows(rows);
    assert.equal(client.passportNumber, "АС3522461");
    assert.equal(client.citizenship, "Akunov");
    assert.equal(client.email, "—");
    assert.equal(client.partnerName, "ШАРИПА");
    assert.equal(client.contract, "дог.оказания услуг");
  });

  it("reads passport from column C when latin name is in column B (legacy header shift)", () => {
    const legacyHeaders = [
      "Фамилия",
      "Номер паспорта",
      "Дата подачи",
      "Дата предпологаемого одобрения",
      "Имя референта",
      "Адрес букинга",
      "Дата букинга (от и до)",
      "Дата одобрения ВНЖ",
      "Заметки",
      "Дата выдачи карточки ВНЖ",
      "Пароль для приложения",
      "портнер от кого клиент",
      "Договор",
    ];

    const rows = [
      legacyHeaders,
      [
        "Белоус Екатерина",
        "Belavus Katsiaryna",
        "КВ2719292",
        "01.04.2026",
        "",
        "",
        "Ivana Tkalčića 34",
        "04.08-11.08",
        "",
        "",
        "",
        "",
        "L@HF#fNfyxeX",
        "ЛЕНА МОСКВА",
        "дог.оказания услуг",
      ],
    ];

    const [client] = parseCroatiaExternalClientsRows(rows);
    assert.equal(client.passportNumber, "КВ2719292");
    assert.equal(client.citizenship, "Belavus Katsiaryna");
  });
});
