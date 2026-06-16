# CRM Write Path — Phase 1 Implementation (Dry Run First)

**Дата:** 16 июня 2026  
**Статус:** реализовано в коде, write в Google Sheet по умолчанию выключен  
**Ограничения соблюдены:** в рамках этой фазы не выполнялись append-записи в CRM.

---

## Что реализовано

### 1) Публичный метод `appendExternalClientRow()`

Добавлен в:

- `src/lib/google-sheets/google-sheets-client.ts`

Что делает:

- берет range из `GOOGLE_SHEETS_CLIENTS_RANGE` (fallback `'В Работе'!A:M`);
- вызывает внутренний `appendRow(...)`.

---

### 2) `buildExternalRowFromFormgridLead()`

Добавлен файл:

- `src/lib/leads/formgrid-to-crm-mapper.ts`

Что добавлено:

- `buildExternalRowFromFormgridLead(...)` — строит массив значений A:M;
- `validateLeadForCrmCreate(...)` — проверяет обязательные поля:
  - ФИО (2+ слова, не test-pattern),
  - паспорт (нормализованный, длина >= 6),
  - телефон (не `#ERROR!`, минимум 10 цифр).

---

### 3) `create_in_crm` подключен к write pipeline

Обновлен:

- `src/lib/leads/lead-review-service.ts`

Новый pipeline для action `create_in_crm`:

1. загрузка лида и Formgrid-row;
2. validation;
3. dedup strong-check;
4. build CRM row A:M;
5. mode switch (status-only / dry-run / write-blocked / write);
6. append только в `write` mode;
7. **fail-closed**: `created_in_crm` только после успешного append.

---

### 4) Feature flags

Поддержаны комбинации:

- `CRM_WRITE_ENABLED=false`
- `CRM_WRITE_DRY_RUN=true`

Их поведение:

| ENABLED | DRY_RUN | Режим |
|---------|---------|-------|
| false | false | status-only (legacy) |
| false | true | dry-run preview |
| true | true | write blocked (fail-safe) |
| true | false | реальный append |

В `.env.example` добавлены:

```env
CRM_WRITE_ENABLED=false
CRM_WRITE_DRY_RUN=true
```

---

### 5) Dry-run поведение

В dry-run (`ENABLED=false`, `DRY_RUN=true`):

- запись в Google Sheet **не выполняется**;
- строка A:M строится;
- результат логируется в `LeadReviewRecord.crmWritePreview`;
- API возвращает success + preview через обновленный `lead.review`.

---

### 6) Dedup перед записью (обязательный)

Проверка strong duplicate использует текущий dedup engine:

- `passport`
- `phone`
- `email`
- `telegram`

При strong duplicate: выбрасывается `LeadReviewActionError(409, "duplicate_detected", ...)`.

---

### 7) Ошибки API

Обновлен:

- `src/app/api/crm/leads/[id]/route.ts`

Добавлена обработка `LeadReviewActionError` со статусом/кодом:

- `409` — duplicate;
- `422` — validation.

---

### 8) Fail-closed статус

Реализовано в `applyLeadReviewAction(...)`:

- в dry-run/status-only статус остается текущим (`created_in_crm` не выставляется);
- `created_in_crm` присваивается только после `appendExternalClientRow(...) === true`.

---

## Файлы, измененные в Phase 1

- `src/lib/google-sheets/google-sheets-client.ts`
- `src/lib/leads/formgrid-to-crm-mapper.ts` (new)
- `src/lib/leads/lead-review-service.ts`
- `src/lib/leads/lead-review-types.ts`
- `src/app/api/crm/leads/[id]/route.ts`
- `.env.example`

---

## Dry-run аудит по всем текущим лидам Formgrid

Источник: live Formgrid + live CRM read-only, без append.

### Сводка

- Всего лидов: **11**
- Dry-run success: **6**
- Blocked validation: **1**
- Blocked duplicates (strong): **5**
- Blocked total (уникальных): **5**

### Заблокированные лиды

| Sheet row | Лид | Причина |
|-----------|-----|---------|
| 3 | Давлятова Лола Бахтиёровна | duplicate: passport |
| 4 | Лысогорская Лейсан Ильдусовна | duplicate: passport |
| 5 | Смола Александра Сергеевна | duplicate: passport |
| 6 | Белкания Автандил Яношевич | validation: phone_invalid + duplicate: passport |
| 8 | Куликова Светлана Васильевна | duplicate: passport |

### Примеры успешных dry-run preview (A:M)

- `sheetRow=2` Белоусова тест 2
- `sheetRow=7` Белоногова Мария Павловна
- `sheetRow=9` Бякова Мария Николаевна

(preview строится, но запись не выполняется в dry-run).

---

## Итог Phase 1

Phase 1 подготовил безопасный write pipeline с dry-run по умолчанию.  
Реальный append остается выключенным до отдельного Go/No-Go.
