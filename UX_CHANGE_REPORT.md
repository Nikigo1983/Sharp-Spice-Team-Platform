# UX Change Report — BL-01 / BL-02 Lead Review Errors

**Дата:** 16 июня 2026  
**Ветка:** `feat/bl-01-bl-02-lead-review-ux-errors`  
**Scope:** UX ошибок `create_in_crm` (без изменений dedup, write-path, ENV)

---

## Проблема

При ошибке PATCH `/api/crm/leads/[id]` UI показывал generic текст **«Не удалось выполнить действие»**, хотя API уже возвращал `{ code, error }`.

---

## Что изменилось

### API codes (только маппинг после существующих проверок)

| HTTP | Код | Когда |
|------|-----|-------|
| 409 | `duplicate_detected_crm` | strong match с источником CRM (приоритет над Desk) |
| 409 | `duplicate_detected_desk` | strong match только Desk / Desk без CRM |
| 409 | `duplicate_detected` | strong match только Formgrid |
| 422 | `test_lead_detected` | test lead guard |
| 422 | `phone_invalid` | некорректный телефон |
| 422 | `validation_error` | прочие ошибки валидации (ФИО, паспорт) |

Логика `analyzeLeadDuplicates` и `validateLeadForCrmCreate` **не менялась** — изменились только коды в `LeadReviewActionError`.

### UI (`LeadReviewDetailView`)

- Читает `code` и `error` из JSON ответа.
- Показывает понятное сообщение через `formatLeadReviewActionUserMessage()`.
- Ошибка отображается в блоке `alertError` с `role="alert"`.
- Сетевой сбой: отдельное сообщение про подключение (не generic patch failed).

### Новые файлы

| Файл | Назначение |
|------|------------|
| `src/lib/leads/lead-review-action-errors.ts` | resolve codes + user messages |
| `src/lib/leads/lead-review-action-errors.test.ts` | unit tests |

---

## Сообщения для менеджера

| Код | Текст в UI |
|-----|------------|
| `duplicate_detected_crm` | Клиент не создан: найден надёжный дубликат в CRM… |
| `duplicate_detected_desk` | Клиент не создан: клиент уже есть в Emigrant Desk… |
| `test_lead_detected` | …тестовый или служебный лид… |
| `phone_invalid` | …телефон в анкете некорректен… |
| `validation_error` | …не хватает обязательных данных… |

---

## Что не менялось

- Desk/CRM dedup матрица
- `appendExternalClientRow` / feature flags / ENV
- Очередь лидов, журнал, метрики (BL-03+)

---

## Тесты

```bash
npm test
```

Добавлено **8** тестов в `lead-review-action-errors.test.ts` (всего suite +8).

---

## Ручная проверка

1. Lead с Desk strong (например row 7) → «Создать в CRM» → сообщение про Emigrant Desk.
2. Lead с CRM strong → сообщение про CRM.
3. Row 2 (test) → сообщение про тестовый лид.
4. Row 6 (phone invalid) → сообщение про телефон.
5. Успешный create / dry-run → без ложной ошибки.

---

*Отчёт подготовлен по итогам BL-01 / BL-02 из `POST_GO_LIVE_BACKLOG.md`.*
