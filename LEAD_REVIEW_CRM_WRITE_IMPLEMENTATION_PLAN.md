# Lead Review → CRM: технический план записи после миграции

**Дата:** 9 июня 2026  
**Статус:** финальная проверка готовности. Код **не менялся**.  
**Предусловие:** CRM — **нативная Google Таблица** (не `.xlsx`), Sheets API `spreadsheets.get` → **200 OK**, backup сохранён.

---

## Executive summary

| Вопрос | Ответ |
|--------|--------|
| **Миграция разблокирует запись?** | **Да** — убирает блокер `document must not be an Office file` для Sheets API append. |
| **Код готов к записи?** | **Нет** — `create_in_crm` только меняет статус в `app_state`, строка в CRM **не создаётся**. |
| **Инфраструктура append есть?** | **Частично** — приватный `appendRow()` в `GoogleSheetsClient`, публичного `appendExternalClientRow` **нет**. |
| **Оценка объёма работ** | **1 PR**, ~4–6 файлов, 1–2 дня с тестом на staging. |

**Вердикт:** после миграции CRM запись **технически возможна**, но требует **отдельной реализации write-path** и обновления ENV. До этого кнопка «Создать клиента в CRM» остаётся **status-only**.

---

## 1. Текущее состояние (as-is)

### 1.1. Цепочка при нажатии «Создать клиента в CRM»

```
UI: LeadReviewDetailView.tsx
  runAction("create_in_crm")
    → PATCH /api/crm/leads/{sheetRow}
      → applyLeadReviewAction(sheetRow, "create_in_crm", session.name)
        → getLeadReviewDetail()  // dedup read-only
        → upsertLeadReview({ status: "created_in_crm", pendingCrmClientId, note: "CRM write-path не подключён…" })
        → return getLeadReviewDetail()
```

**Файлы:**

| Слой | Файл |
|------|------|
| UI | `src/components/leads/LeadReviewDetailView.tsx` (кнопка, строка 245) |
| API | `src/app/api/crm/leads/[id]/route.ts` (`PATCH`, action `create_in_crm`) |
| Бизнес-логика | `src/lib/leads/lead-review-service.ts` (`applyLeadReviewAction`, строки 188–193) |
| Dedup | `src/lib/leads/lead-review-dedup.ts` → `areClientsDuplicates()` |
| Состояние очереди | `src/lib/leads/lead-review-store.ts` → Supabase `app_state.formgrid_lead_reviews` |

### 1.2. Что делает `create_in_crm` сейчас

```typescript
// lead-review-service.ts (упрощённо)
if (action === "create_in_crm") {
  record.pendingCrmClientId = passportNorm || `FG-ROW-${detail.sheetRow}`;
  record.note =
    "CRM write-path не подключён — статус зафиксирован, запись в Google Sheets будет в следующей фазе.";
}
await upsertLeadReview(record);
```

- **Не вызывает** Google Sheets API.
- **Не проверяет** strong duplicate перед сменой статуса (только предупреждение в UI).
- **Не откатывает** статус при ошибке записи (записи ещё нет — ошибки нет).

### 1.3. Существующий write в Google Sheets

| Метод | Назначение | Используется |
|-------|------------|--------------|
| `appendRow(range, values)` | private, Sheets API `values:append` | Только `appendNote()` |
| `updateCell()` | private | `updateNote`, `updateClientField` |
| `appendExternalClientRow()` | — | **Не существует** |

**Важно:** чтение CRM в production идёт через **public CSV** (`GOOGLE_SHEETS_PUBLIC_CLIENTS_GID`), запись пойдёт через **Service Account + Sheets API** — режимы **совместимы** (read CSV + write API).

---

## 2. Что осталось сделать в коде

### 2.1. Обязательный минимум (MVP)

| # | Задача | Файл(ы) | Описание |
|---|--------|---------|----------|
| 1 | **`buildExternalRowFromFormgridLead()`** | новый `src/lib/leads/formgrid-to-crm-mapper.ts` | Formgrid headers + row → массив `string[]` длиной 13 (колонки A–M External) |
| 2 | **`appendExternalClientRow()`** | `src/lib/google-sheets/google-sheets-client.ts` | Публичный метод: `appendRow(getExternalAppendRange(), values)` + `invalidateCache("clients")` |
| 3 | **`isCrmWriteConfigured()`** | `src/lib/google-sheets/auth.ts` | SA email + private key + spreadsheet ID; опционально probe `spreadsheets.get` |
| 4 | **Подключить write в `applyLeadReviewAction`** | `src/lib/leads/lead-review-service.ts` | При `create_in_crm`: guard → dedup → append → success/fail |
| 5 | **Ошибки API** | `src/app/api/crm/leads/[id]/route.ts` | 409 при strong dup, 422 без паспорта, 503 если write не настроен, 502 если append failed |
| 6 | **UI feedback** | `LeadReviewDetailView.tsx` | Показать ошибку сервера; ссылка `/clients/{passport}` при успехе; не давать повтор при success |
| 7 | **ENV example** | `.env.example` | `GOOGLE_SHEETS_CLIENTS_RANGE=External!A:M` |
| 8 | **Сброс кэша** | уже есть `invalidateCache("clients")` в `appendRow` | Убедиться, что вызывается после append |

### 2.2. Mapping строки External (колонки A–M)

Порядок из `parseCroatiaExternalClientsRows` (`parse.ts`, `COL`):

| Col | Заголовок CRM | Источник Formgrid | Значение при создании |
|-----|---------------|-------------------|------------------------|
| A | Фамилия | `getFormgridClientFields().name` | **Первый токен** (фамилия) |
| B | (пусто / латиница) | колонка «ФИО латинскими» | Латиница или `""` |
| C | Номер паспорта | `fields.passport` | `normalizePassport` raw display |
| D | Дата подачи | `fields.submittedAt` | Дата анкеты |
| E | Дата предполагаемого одобрения | — | `""` |
| F | Имя референта | — | `""` |
| G | Адрес букинга | — | `""` |
| H | Дата букинга | — | `""` |
| I | Дата одобрения ВНЖ | — | `""` |
| J | Заметки | шаблон | См. §2.3 |
| K | Дата выдачи карточки ВНЖ | — | `""` |
| L | Пароль для приложения | — | `""` |
| M | партнёр | — | `""` |

**Range для append:** `External!A:M` (из `GOOGLE_SHEETS_CLIENTS_RANGE`, не `Clients!`).

### 2.3. Шаблон начальной заметки (колонка J)

```
[Lead Review import, Formgrid row {sheetRow}, {ISO date}, {manager name}]
ФИО: {full name}
Телефон: {phone}
Email: {email or "не указан"}
Дата рождения: {birthDate}
```

Контакты в заметках — пока в CRM **нет колонок** phone/email.

### 2.4. Логика `applyLeadReviewAction` (целевая)

```
create_in_crm:
  1. if !isCrmWriteConfigured() → throw / return 503
  2. if !normalizePassport(passport) valid (≥6) → return 422
  3. re-run analyzeLeadDuplicates(lead, crm, fg)
  4. if hasStrongMatch && source=crm → return 409 (не писать)
  5. buildExternalRowFromFormgridLead(...)
  6. ok = await getGoogleSheetsClient().appendExternalClientRow(row)
  7. if !ok → return 502, НЕ менять status на created_in_crm
  8. upsertLeadReview({
       status: "created_in_crm",
       pendingCrmClientId: passportNorm,
       note: "Создан в CRM External, строка append",
       crmWriteAt: now,
     })
  9. optional: setAppState link formgrid_row → passport_norm
 10. return getLeadReviewDetail()
```

### 2.5. Рекомендуемые улучшения (не блокер MVP)

| Задача | Зачем |
|--------|-------|
| Блокировать кнопку при `hasStrongMatch` (или confirm modal) | Снижение дублей по UI |
| `extractSurname()` с учётом двойных фамилий | Качество колонки A |
| `app_state.formgrid_crm_links` | UCI / идемпотентность повторного клика |
| Idempotency: если паспорт уже в CRM → link, не append | Повторное нажатие после сбоя |
| Role check на `PATCH` (только manager/admin) | Сейчас любой авторизованный пользователь |
| Диагностика в `clients-diagnostic` | `crmWrite: ok/fail` |
| Обновить `relocation/forms.ts` hardcoded URL | После смены spreadsheet ID |

### 2.6. Что менять не нужно для MVP

- Formgrid read path
- Public CSV read path
- Lead Review dedup engine (только вызвать guard)
- Миграции Supabase

---

## 3. Переменные окружения

### 3.1. Обязательные для записи

| ENV | Назначение | После миграции |
|-----|------------|----------------|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID **нативной** таблицы CRM | Новый ID, если Вариант B (новый файл) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | JWT для Sheets API | Без изменений |
| `GOOGLE_PRIVATE_KEY` | Ключ SA | Без изменений |
| `GOOGLE_SHEETS_CLIENTS_RANGE` | Range append/read API | **`External!A:M`** или `External!A1:M5000` |

### 3.2. Для чтения (production, без изменения логики)

| ENV | Назначение | После миграции |
|-----|------------|----------------|
| `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID` | Public CSV External | **Новый `gid`** вкладки External (почти наверняка ≠ `1431336126`) |

### 3.3. Опциональные

| ENV | Назначение |
|-----|------------|
| `GOOGLE_SHEETS_CACHE_TTL_MS` | TTL кэша после append (default 10000) — можно снизить на время тестов |

### 3.4. Не требуются для write

`GOOGLE_SHEETS_FORMGRID_*`, `EMIGRANT_*`, `SUPABASE_*` (кроме `app_state` для lead reviews).

### 3.5. Типичная production-конфигурация после миграции

```env
GOOGLE_SHEETS_SPREADSHEET_ID={NEW_NATIVE_SHEET_ID}
GOOGLE_SHEETS_PUBLIC_CLIENTS_GID={NEW_EXTERNAL_GID}
GOOGLE_SHEETS_CLIENTS_RANGE=External!A:M
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**Антипаттерн:** оставить `GOOGLE_SHEETS_CLIENTS_RANGE=Clients!A1:Z2000` — append уйдёт на **несуществующую** вкладку или не External.

### 3.6. JWT scopes (текущие)

В `auth.ts` для SA:

```
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/drive.readonly
```

Для **append в таблицу** достаточно `spreadsheets` + роль **Editor** на файл. Отдельный `drive` write scope **не нужен**, если файл уже расшарен на SA.

---

## 4. Права Service Account

### 4.1. Google Drive / Sheets

| Требование | Детали |
|------------|--------|
| **Роль на файл CRM** | **Редактор (Editor)** — не «Комментатор», не только Viewer |
| **Кому расшарить** | Email из `GOOGLE_SERVICE_ACCOUNT_EMAIL` |
| **Тип файла** | Native Google Spreadsheet (`application/vnd.google-apps.spreadsheet`) |
| **API** | Google Sheets API **включён** в GCP-проекте SA |

### 4.2. Проверки перед включением write

| # | Проверка | Ожидание |
|---|----------|----------|
| 1 | `GET .../v4/spreadsheets/{ID}` с SA token | 200, список листов содержит `External` |
| 2 | `GET .../values/External!A1:M1` | Заголовки как в парсере |
| 3 | Тестовый `append` одной строки `TEST-DELETE` | 200, строка в конце листа |
| 4 | Удалить тестовую строку вручную | — |
| 5 | Public CSV с новым gid | ~93 клиента, парсер без регрессий |

### 4.3. Известные проблемы окружения

- **JWT clock skew** → 403 на Drive/Sheets (синхронизация времени сервера).
- **SA не добавлен на новый файл** после Варианта B → 403 Permission denied на append.
- **Старый `.xlsx` ID в ENV** → 400 Office file даже при наличии SA.

---

## 5. Метод при нажатии «Создать клиента» (целевая архитектура)

### 5.1. Call stack (после реализации)

```
LeadReviewDetailView.runAction("create_in_crm")
  ↓
PATCH /api/crm/leads/{sheetRow}  body: { action: "create_in_crm" }
  ↓
applyLeadReviewAction(sheetRow, "create_in_crm", updatedBy)
  ↓
getLeadReviewDetail(sheetRow)           // свежий dedup
  ↓
assertCrmWriteReady()                   // isCrmWriteConfigured()
  ↓
assertLeadImportable(detail)            // passport, not strong dup
  ↓
buildExternalRowFromFormgridLead(
    formgrid.headers,
    formgrid.rows[dataRowIndex],
    { sheetRow, importedBy: updatedBy }
  )
  ↓
getGoogleSheetsClient().appendExternalClientRow(rowValues)
  ↓  internally
  appendRow("External!A:M", rowValues)   // POST .../values/External!A:M:append
  invalidateCache("clients")
  ↓
upsertLeadReview({ status: "created_in_crm", ... })
  ↓
getLeadReviewDetail(sheetRow)
```

### 5.2. Новый публичный метод (проектируемая сигнатура)

```typescript
// google-sheets-client.ts (план, не реализовано)
async appendExternalClientRow(values: string[]): Promise<{
  ok: boolean;
  error?: string;
}> 
```

```typescript
// formgrid-to-crm-mapper.ts (план)
export function buildExternalRowFromFormgridLead(
  headers: string[],
  row: string[],
  meta: { sheetRow: number; importedBy: string },
): string[]
```

### 5.3. Идентификатор клиента после создания

- **CRM `Client.id`** = значение колонки C (паспорт), как в `parseCroatiaExternalClientsRows`.
- **Ссылка в UI:** `/clients/{normalizePassport(passport)}` или raw passport как в списке.
- **`pendingCrmClientId`** в lead review → тот же `passport_norm`.

---

## 6. Риски дубликатов (остаются после миграции)

### 6.1. Что закрывает реализация по дизайну

| Риск | Митигация в плане |
|------|------------------|
| Повторный паспорт в CRM | **409** если `analyzeLeadDuplicates.hasStrongMatch` (CRM) |
| Паспорт + телефон + email + telegram | Strong keys в `areClientsDuplicates` |
| Разные паспорта, одинаковое ФИО | **Не merge** (`passportsDiffer`) — можно создать вторую строку (риск остаётся) |

### 6.2. Что остаётся открытым

| Риск | Severity | Комментарий |
|------|----------|-------------|
| **Strong match — только warning в UI** | **Высокий** | Сейчас кнопка **не disabled** при `hasStrongMatch`; без server-side 409 менеджер может создать дубль |
| **Possible duplicate (FIO-only)** | **Средний** | Однофамильцы: «Куликова» в CRM + «Куликова Светлана» в Formgrid — strong по паспорту, но без паспорта в анкете → `FG-ROW-N` |
| **Пустой / короткий паспорт** | **Высокий** | Без валидного паспорта CRM id нестабилен; нужен hard block |
| **Race condition** | **Средний** | Два менеджера одновременно: оба проходят dedup до append → две строки (редко) |
| **Повторная анкета Formgrid** | **Средний** | Новая строка FG, тот же человек, другой row — dedup по паспорту спасёт, без паспорта — нет |
| **Status-only bug сегодня** | **Высокий** | `created_in_crm` без строки → ложное «уже создан»; при MVP нужен fail-closed (статус только после ok append) |
| **Кэш 10 с** | **Низкий** | После append `invalidateCache` — ок; другие инстансы/serverless cold start — eventual consistency |
| **Ручной дубль в CRM** | **Низкий** | Менеджер добавил строку в Sheets вручную между dedup и append — редкий race |
| **Дубль Formgrid ↔ Formgrid** | **Низкий** | Вторая анкета того же человека; strong match к другой FG-строке не блокирует CRM create |

### 6.3. Рекомендуемая политика дедупа для write

```
Перед append:
  IF strong match to CRM → HTTP 409, предложить clientId существующего
  IF possible match only → разрешить с ?force=true ИЛИ блокировать до mark_reviewed
  IF passport invalid → HTTP 422
  IF passport already exists in CRM (exact norm) → HTTP 409 idempotent (link, не append)
```

### 6.4. Покрытие dedup (напоминание из UCI audit)

- CRM ↔ Formgrid strong (passport): **~5%** CRM, **~45%** Formgrid.
- Email в Formgrid часто **пуст** → якорь email не работает.
- Телефон заполнен → secondary anchor после паспорта.

---

## 7. Чеклист внедрения (порядок работ)

### Фаза A — Миграция CRM (без write)

- [ ] Нативная таблица, backup, ENV id + gid
- [ ] `/clients` и Lead Review dedup работают на новых данных

### Фаза B — Проверка write capability

- [ ] SA Editor на новый файл
- [ ] `GOOGLE_SHEETS_CLIENTS_RANGE=External!A:M`
- [ ] Ручной тестовый append + delete

### Фаза C — Код (отдельный PR)

- [ ] `formgrid-to-crm-mapper.ts`
- [ ] `appendExternalClientRow()`
- [ ] `isCrmWriteConfigured()`
- [ ] `applyLeadReviewAction` с guards и fail-closed
- [ ] API codes 409/422/502/503
- [ ] UI: ошибки + ссылка на клиента

### Фаза D — Приёмка

- [ ] Лид **без** дубля → строка в External, виден в `/clients` ≤ TTL кэша
- [ ] Лид **Давлятова/Смола** (strong dup) → **409**, строка не добавлена
- [ ] Лид без паспорта → **422**
- [ ] Повторный клик после успеха → кнопка disabled (`created_in_crm`)
- [ ] Заметка CRM содержит контакты из Formgrid
- [ ] `pendingCrmClientId` = паспорт, совпадает с `Client.id`

---

## 8. Definition of Done (запись из Lead Review)

- [ ] Нативная Google Sheet, Sheets API append **200**
- [ ] Кнопка «Создать клиента в CRM» создаёт **реальную строку** External
- [ ] Strong duplicate **блокируется на сервере**
- [ ] При ошибке append статус lead review **не** `created_in_crm`
- [ ] ENV документированы, `Clients!` заменён на `External!`
- [ ] Менеджер видит нового клиента в `/clients` после создания

---

## Связанные документы

- `CRM_GOOGLE_SHEETS_MIGRATION_PLAN.md` — миграция xlsx → Sheets  
- `FORMGRID_TO_CRM_DESIGN.md` — mapping и dedup policy  
- `UNIFIED_CLIENT_INDEX_DESIGN.md` — link `formgrid_row → passport`  
- `CLIENT_LIFECYCLE_ENGINE_DESIGN.md` — переход Lead → Qualified  

---

*План основан на коде репозитория (июнь 2026). Реализация не начата.*
