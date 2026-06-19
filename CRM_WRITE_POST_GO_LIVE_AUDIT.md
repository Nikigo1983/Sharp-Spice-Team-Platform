# CRM Write Post-Go-Live Audit

**Дата:** 2026-06-16T17:05:28.670Z  
**Режим:** read-only аудит (без append, без изменения данных)  
**Источники:** Formgrid (google_sheets), CRM (google_sheets), Emigrant Desk (88 clients), Lead Review store (Supabase/file)

---

## Runtime snapshot (local env mirror)

| Параметр | Значение |
|---|---|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | 138W2nHQcJu_xRsI2RBqeD6Oq8Tg9FbKH |
| `GOOGLE_SHEETS_CLIENTS_RANGE` | (не задана → fallback 'В Работе'!A:M) |
| `CRM_WRITE_ENABLED` | (не задана) |
| `CRM_WRITE_DRY_RUN` | (не задана) |
| `resolveCrmWriteMode()` | **status_only** |

---

## 1. Лиды со статусом «Создан в CRM»

Количество: **1**

| Row | ФИО | Паспорт | Note | Preview mode |
| --- | --- | --- | --- | --- |
| 12 | ЕДРЕЦ ЕВГЕНИЯ ГРИГОРЬЕВНА | 772808561 | CRM row appended successfully. | write |

---

## 2. Strong duplicate через Emigrant Desk

Количество: **9**

| Row | ФИО | Desk match |
| --- | --- | --- |
| 3 | Давлятова Лола Бахтиёровна | Давлятова Лола (Desk case_number, Desk email) |
| 4 | Лысогорская Лейсан Ильдусовна | Лысогорская Лейсан (Desk case_number, Desk email) |
| 5 | Смола Александра Сергеевна | Смола Александра (Desk case_number, Desk email) |
| 6 | Белкания Автандил Яношевич | Белкания Автандил (Desk case_number, Desk email) |
| 7 | Белоногова Мария Павловна | Белоногова Мария (Desk case_number) |
| 8 | Куликова Светлана Васильевна | Куликова Светлана (Desk case_number, Desk email) |
| 9 | Бякова Мария Николаевна | Бякова Мария (Desk case_number, Desk email) |
| 10 | Кулешова Леонелла Евгеньевна | КУЛЕШОВА Леонелла (Desk case_number, Desk email) |
| 11 | Тайк Филипп Майерович | Тайк Филипп (Desk case_number, Desk email) |

---

## 3. Лиды, заблокированные `create_in_crm` (HTTP 409)

Количество: **8**

| Row | ФИО | Strong sources | Причины |
| --- | --- | --- | --- |
| 3 | Давлятова Лола Бахтиёровна | crm, desk | паспорт, Desk case_number, Desk email |
| 4 | Лысогорская Лейсан Ильдусовна | crm, desk | паспорт, Desk case_number, Desk email |
| 5 | Смола Александра Сергеевна | crm, desk | паспорт, Desk case_number, Desk email |
| 7 | Белоногова Мария Павловна | desk | Desk case_number |
| 8 | Куликова Светлана Васильевна | crm, desk | паспорт, Desk case_number, Desk email |
| 9 | Бякова Мария Николаевна | crm, desk | паспорт, Desk case_number, Desk email |
| 10 | Кулешова Леонелла Евгеньевна | crm, desk | паспорт, Desk case_number, Desk email |
| 11 | Тайк Филипп Майерович | desk | Desk case_number, Desk email |

---

## 4. Лиды без duplicate-сигналов (LOW)

Количество: **2**

| Row | ФИО | Паспорт | Validation |
| --- | --- | --- | --- |
| 2 | Белоусова тест 2 | 54689743 | name_invalid, test_lead_detected |
| 12 | ЕДРЕЦ ЕВГЕНИЯ ГРИГОРЬЕВНА | 772808561 | ok |

---

## 5. Лиды с `validation_error`

Количество: **2**

| Row | ФИО | Errors | HTTP при create_in_crm |
| --- | --- | --- | --- |
| 2 | Белоусова тест 2 | name_invalid, test_lead_detected | 422 |
| 6 | Белкания Автандил Яношевич | phone_invalid | 422 |

---

## Распределение риска (dedup)

| Класс | Кол-во |
|---|---|
| HIGH (strong) | 9 |
| MEDIUM | 0 |
| LOW | 2 |

Всего лидов в Formgrid: **11**

---

## Вердикт

| Проверка | Результат |
|---|---|
| **CRM Write работает** | **Частично** — в Lead Review store зафиксирован **1** успешный append (row 12, ЕДРЕЦ: note `CRM row appended successfully.`, preview mode `write`). Текущий env-mirror: `status_only` (флаги `CRM_WRITE_*` не заданы локально / вероятно на Production). |
| **Dedup работает** | **Да** — 9 лидов с Desk strong-match, 8 лидов получили бы HTTP 409 при `create_in_crm` (при валидных полях). Test lead guard блокирует row 2 (422). |
| **Rollout завершён** | **Нет** — нет стабильного production-режима `write`, `GOOGLE_SHEETS_SPREADSHEET_ID` всё ещё `.xlsx` (`138W2nHQcJu…`), cutover на native sheet не подтверждён. |

### Наблюдения post-go-live

- **Единственный «Создан в CRM»:** row 12 (ЕДРЕЦ ЕВГЕНИЯ ГРИГОРЬЕВНА) — статус выставлен после успешного append (fail-closed pipeline).
- **Desk dedup:** закрывает ранее пропущенные кейсы (Белоногова, Бякова, Тайк и др.).
- **Без сигналов (LOW):** 2 лида — из них только row 12 валиден для create; row 2 заблокирован test lead guard.
- **Validation 422:** row 2 (test lead), row 6 (phone_invalid — при этом есть Desk strong, но до dedup не дойдёт).

### Единственный оставшийся блокер завершения rollout

Стабильный production cutover: **native Google Sheet** + явные флаги `CRM_WRITE_ENABLED` / `CRM_WRITE_DRY_RUN` + верификация append в целевой таблице после smoke на row 12.

---

*Аудит выполнен скриптом `scripts/post-go-live-audit.mjs` против live Formgrid/CRM/Desk данных.*
