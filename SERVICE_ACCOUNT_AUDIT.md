# Service Account Audit

**Дата:** 16 июня 2026  
**Режим:** read-only аудит, без изменений данных/ENV

---

## 1) Какой `GOOGLE_SERVICE_ACCOUNT_EMAIL` реально используется в runtime

`sharp-spice-platform@project-3bfd25e8-8781-480b-8f9.iam.gserviceaccount.com`

Источник runtime загрузки: `.env.local` (файл `.env` не использовался, т.к. отсутствует).

---

## 2) Первые 8 символов `client_email` после загрузки credentials

`sharp-sp`

---

## 3) Совпадает ли с ожидаемым email

Ожидаемый:

`sharp-spice-platform@project-3bfd25e8-8781-480b-8f9.iam.gserviceaccount.com`

Результат: **Да, совпадает (`true`)**.

---

## 4) Какой `project_id` загружается из credentials

В текущем способе хранения credentials (env email + private key) отдельного JSON-поля `project_id` нет.  
Используемый project-id, извлечённый из `client_email`:

`project-3bfd25e8-8781-480b-8f9`

---

## 5) Есть ли несколько конфигураций Service Account в проекте

Фактически обнаружено:

- `.env.local` — **есть runtime конфигурация** (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`);
- `.env` — отсутствует;
- `.env.example` — есть шаблонная (пустая) конфигурация.

Итог: **одна активная runtime-конфигурация Service Account**.

---

## 6) Каким аккаунтом выполняется `spreadsheets.get()`

`spreadsheets.get()` подписывается JWT с issuer:

`sharp-spice-platform@project-3bfd25e8-8781-480b-8f9.iam.gserviceaccount.com`

Проверка выполнялась по `GOOGLE_SHEETS_SPREADSHEET_ID=138W2nHQcJu_xRsI2RBqeD6Oq8Tg9FbKH`, статус ответа: **400** (ожидаемо для Office `.xlsx`).

---

## Дополнительно: Drive API — первые Spreadsheet-файлы, доступные Service Account

Запрос: `mimeType='application/vnd.google-apps.spreadsheet'`, `pageSize=10`  
Результат: API вернул **4** доступных Spreadsheet-файла.

| # | File ID | Name | Owner | Modified |
|---|---------|------|-------|----------|
| 1 | `1zMv0ySpJAPtTQHPgB96dLvhGDKetm9HR1b3l9yFy_6U` | `Copy of таблица Клиенты Хорватия 2` | `virineya1983@gmail.com` | `2026-06-16T09:00:10.988Z` |
| 2 | `1S8Y0VCaAQ78wxg5Rxl8fcFMkwSsvr-X-cLrAlK4nF9Q` | `FormGrid: Google Sheets` | `virineya1983@gmail.com` | `2026-06-15T13:06:38.701Z` |
| 3 | `1IhUbGKPoDxG6druZZ4U9pKVarJ0Jn5XDa_g3_2RN7gE` | `Клиенты Хорватия_tracker` | `virineya1983@gmail.com` | `2026-05-23T08:56:37.251Z` |
| 4 | `1OLGjK-LLQAys-asmG-ddaKdx0n4GqaSn0sTDyOEvPU0` | `таблица Клиенты Хорватия` | `iuliia.zhdanovich@gmail.com` | `2026-05-12T20:48:15.818Z` |

---

## Итог

Runtime использует именно ожидаемый Service Account:

`sharp-spice-platform@project-3bfd25e8-8781-480b-8f9.iam.gserviceaccount.com`

Конфигурация SA в runtime — одна, и этот аккаунт успешно аутентифицируется в Google API и видит Spreadsheet-файлы в Drive.
