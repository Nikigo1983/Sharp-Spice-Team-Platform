import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCroatiaExternalClientsRows } from "@/lib/google-sheets/parse";

/** Шапка без колонки латиницы (как в production External gid=1431336126). */
const EXTERNAL_HEADERS = [
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

describe("parseCroatiaExternalClientsRows", () => {
  it("reads passport from column C when latin name is in column B", () => {
    const rows = [
      EXTERNAL_HEADERS,
      [
        "Белоус Екатерина",
        "Belavus Katsiaryna",
        "КВ2719292",
        "01.04.2026",
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
    assert.equal(client.name, "Белоус Екатерина");
    assert.equal(client.citizenship, "Belavus Katsiaryna");
    assert.equal(client.passportNumber, "КВ2719292");
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
        "10.03.2026",
        "",
        "Karamanov prilaz 2",
        "12.06-14.06",
        "",
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
    assert.equal(client.partnerName, "ШАРИПА");
    assert.equal(client.contract, "дог.оказания услуг");
  });
});
