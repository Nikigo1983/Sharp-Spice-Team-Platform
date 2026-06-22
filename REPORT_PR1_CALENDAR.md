# Report — Calendar PR #1 (Schema + Repository + Store)

**Дата:** 2026-06-20  
**PR:** #1 из `CALENDAR_IMPLEMENTATION_PLAN.md`  
**Scope:** Schema, Repository layer, Store layer only

---

## Результат

| Критерий | Статус |
|----------|--------|
| Миграция `009_calendar.sql` | ✅ |
| Типы и константы | ✅ |
| Supabase repo (`calendar-events-repo.ts`) | ✅ |
| Dual-storage store (`store.ts`) | ✅ |
| API routes | ❌ не в scope |
| UI / nav | ❌ не в scope |
| RBAC module (`permissions.ts`) | ❌ PR #2 |
| `npm run build` | ✅ |
| `npm test` | ✅ 62/62 |

---

## Новые файлы (6)

| # | Файл | Назначение |
|---|------|------------|
| 1 | `supabase/migrations/009_calendar.sql` | DDL `calendar_events` + индексы + CHECK |
| 2 | `src/lib/calendar/types.ts` | `CalendarEvent`, inputs, list options |
| 3 | `src/lib/calendar/constants.ts` | `CALENDAR_COMPANY_ID`, TZ, colors |
| 4 | `src/lib/supabase/calendar-events-repo.ts` | Supabase CRUD + range list |
| 5 | `src/lib/calendar/store.ts` | JSON/Supabase orchestration |
| 6 | `REPORT_PR1_CALENDAR.md` | Этот отчёт |

---

## Изменённые файлы

| Файл | Изменение |
|------|-----------|
| — | **Нет** — существующий код платформы не менялся |

`.gitignore` уже содержит `.data/` — отдельное изменение не потребовалось.

---

## Архитектура

```
calendar/store.ts
  ├── isSupabaseConfigured() → calendar-events-repo.ts → getSupabaseAdmin()
  └── else → .data/calendar-events.json
```

### Store API (server-only)

| Функция | Описание |
|---------|----------|
| `listEventsInRange(opts)` | Overlap filter + scope/owner scoping |
| `getEvent(id)` | Одно событие |
| `createEvent(input)` | UUID, timestamps, invariants |
| `updateEvent(id, input)` | Partial update |
| `deleteEvent(id)` | Hard delete |

### Invariants (в store, до PR #2 validation module)

- `title` не пустой после trim  
- `scope === 'personal'` → `ownerUserId` обязателен  
- `endAt >= startAt`  
- `companyId` всегда `sharp-spice`  
- Company events: `ownerUserId = null`

### List scoping

- `scopes`: default `['personal', 'company']`  
- Personal events возвращаются только при `ownerUserId` в options  
- Company events видны всем запросам с `scopes` включающим `company`

### Overlap query (repo)

Событие попадает в диапазон `[from, to)` если:

`start_at < to` AND `end_at > from`

---

## Schema `calendar_events`

Соответствует `CALENDAR_MVP_SPEC.md` §7.2:

- `scope`: `personal` | `company`  
- `event_type`: default `general`  
- CHECK: personal → `owner_user_id` NOT NULL  
- CHECK: `end_at >= start_at`  
- Индексы: range, personal partial, company partial

**Deploy note:** миграцию нужно применить вручную в Supabase SQL Editor после merge.

---

## Что намеренно не сделано (следующие PR)

| PR | Deliverable |
|----|-------------|
| #2 | `permissions.ts`, `validation.ts`, unit tests |
| #3 | `/api/calendar/events` |
| #4+ | UI, nav, views |

---

## Тесты

```
npm test → 62/62 passed
npm run build → success
```

Unit-тесты календаря — **PR #2** (permissions + validation).  
Ручная проверка store (JSON fallback) — опционально через Node REPL / временный script (не добавлен в PR #1).

---

## Риски и митигации

| Риск | Митигация в PR #1 |
|------|-------------------|
| Миграция не применена на prod | JSON fallback; документировано в отчёте |
| IDOR на list | Store фильтрует personal по `ownerUserId`; API добавит session в PR #3 |
| Дублирование validation | PR #2 вынесет `assertEventInvariants` в `validation.ts` |

---

## Diff summary

```
 supabase/migrations/009_calendar.sql          |  35 +++
 src/lib/calendar/constants.ts                  |   9 +
 src/lib/calendar/store.ts                      | 248 +++
 src/lib/calendar/types.ts                      |  58 +
 src/lib/supabase/calendar-events-repo.ts       | 131 +++
 REPORT_PR1_CALENDAR.md                        | (this file)
```

**~481 строк** нового кода (без отчёта).

---

## Следующий шаг

**PR #2:** `src/lib/calendar/permissions.ts`, `validation.ts`, tests, refactor store to use validation module.
