# Report — Calendar PR #3 (REST API)

**Дата:** 2026-06-20  
**PR:** #3 из `CALENDAR_IMPLEMENTATION_PLAN.md`  
**Scope:** REST API layer only (5 HTTP endpoints)

---

## Результат

| Критерий | Статус |
|----------|--------|
| `GET /api/calendar/events` (list) | ✅ |
| `POST /api/calendar/events` (create) | ✅ |
| `GET /api/calendar/events/[id]` | ✅ |
| `PATCH /api/calendar/events/[id]` | ✅ |
| `DELETE /api/calendar/events/[id]` | ✅ |
| Session auth (`getSession()` → 401) | ✅ |
| RBAC через `permissions.ts` | ✅ |
| Validation через `validation.ts` | ✅ |
| API tests (`handlers.test.ts`) | ✅ 12 новых тестов |
| UI / nav / views | ❌ не в scope |
| AI / CRM / notifications | ❌ не в scope |
| `npm run build` | ✅ |
| `npm test` | ✅ 93/93 |

---

## Новые файлы (5)

| # | Файл | Назначение |
|---|------|------------|
| 1 | `src/lib/calendar/handlers.ts` | Testable handler layer: list, create, get, update, delete |
| 2 | `src/lib/calendar/handlers.test.ts` | API-level tests с in-memory mock store |
| 3 | `src/app/api/calendar/events/route.ts` | `GET` list + `POST` create |
| 4 | `src/app/api/calendar/events/[id]/route.ts` | `GET`, `PATCH`, `DELETE` by id |
| 5 | `REPORT_PR3_CALENDAR.md` | Этот отчёт |

---

## Изменённые файлы (1)

| Файл | Изменение |
|------|-----------|
| `package.json` | Добавлен `src/lib/calendar/handlers.test.ts` в `npm test` |

Существующие модули PR #1 (`store.ts`, repo) и PR #2 (`permissions.ts`, `validation.ts`) **не менялись**.

---

## Архитектура

```
Next.js route handlers
  └── getSession() → 401 if missing
        └── handlers.ts (injectable CalendarStoreDeps for tests)
              ├── permissions.ts — canView / canEdit / canDelete / canCreateWithScope
              ├── validation.ts — validateCreateInput, validateUpdateInput, parseIsoRange
              └── store.ts — listEventsInRange, getEvent, createEvent, updateEvent, deleteEvent
```

### Endpoints

| Method | Path | Handler | Success | Errors |
|--------|------|---------|---------|--------|
| `GET` | `/api/calendar/events` | `handleListCalendarEvents` | `200 { events }` | 401, 422 |
| `POST` | `/api/calendar/events` | `handleCreateCalendarEvent` | `201 { event }` | 401, 403, 422 |
| `GET` | `/api/calendar/events/[id]` | `handleGetCalendarEvent` | `200 { event }` | 401, 404 |
| `PATCH` | `/api/calendar/events/[id]` | `handleUpdateCalendarEvent` | `200 { event }` | 401, 403, 404, 422 |
| `DELETE` | `/api/calendar/events/[id]` | `handleDeleteCalendarEvent` | `200 { ok: true }` | 401, 403, 404 |

### Query params (list)

| Param | Required | Default | Описание |
|-------|----------|---------|----------|
| `from` | yes | — | ISO 8601, начало диапазона |
| `to` | yes | — | ISO 8601, конец диапазона |
| `scopes` | no | `personal,company` | Comma-separated: `personal`, `company` |

### Security decisions

- **POST:** `ownerUserId`, `createdByUserId`, `createdByName` берутся из session; body-поля игнорируются. `companyId` задаётся в store (`CALENDAR_COMPANY_ID`).
- **GET by id:** чужой personal event → **404** (не 403), anti-enumeration.
- **PATCH:** whitelist полей (`title`, `description`, `startAt`, `endAt`, `allDay`, `location`); `scope`, `ownerUserId` и др. → 422.
- **List:** store фильтрует personal по `session.id` через `ownerUserId` в `listEventsInRange`.

---

## Тесты

### Calendar API tests (`handlers.test.ts`) — 12 tests

| Suite | Cases |
|-------|-------|
| `parseScopesParam` | default scopes; comma-separated |
| `handleListCalendarEvents` | missing from/to → 422; personal scoping |
| `handleCreateCalendarEvent` | owner from session; invalid body → 422 |
| `handleGetCalendarEvent` | foreign personal → 404; company visible |
| `handleUpdateCalendarEvent` | manager edit foreign company → 403; owner → 200; forbidden field → 422 |
| `handleDeleteCalendarEvent` | delete own personal |

### Full suite

```
npm test  → 93/93 passed (81 existing + 12 new calendar handler tests)
npm run build → success (routes /api/calendar/events registered)
```

---

## Что намеренно не сделано (следующие PR)

| PR | Deliverable |
|----|-------------|
| #4 | Nav, `/calendar` page shell, toolbar, fetch from UI |
| #5–#7 | Day / month / week views |
| #8 | CRUD modals |
| #9 | Filters, URL sync, polish |

---

## Риски и митигации

| Риск | Митигация в PR #3 |
|------|-------------------|
| IDOR — чужие personal в list | Store + `ownerUserId: session.id` в list handler |
| Client подменяет `ownerUserId` | Игнорируется в POST; set from session |
| Утечка существования personal event | 404 на GET/PATCH/DELETE чужого personal |
| RBAC только в UI | Все write/read paths вызывают `permissions.ts` |
| Миграция не применена | JSON fallback из PR #1; API работает без Supabase |

---

## Diff summary

```
 package.json                                   |   1 +
 src/app/api/calendar/events/route.ts            |  43 +++
 src/app/api/calendar/events/[id]/route.ts       |  58 +++
 src/lib/calendar/handlers.ts                    | 298 +++
 src/lib/calendar/handlers.test.ts               | 298 +++
 REPORT_PR3_CALENDAR.md                          | (this file)
```

**~698 строк** нового кода (без отчёта).

---

## Ручная проверка (после merge + login)

- [ ] `GET /api/calendar/events?from=...&to=...` без cookie → 401
- [ ] `POST` personal event → 201; второй manager не видит в list
- [ ] `POST` company event → виден обоим managers
- [ ] `PATCH` чужого company event manager → 403; owner → 200
- [ ] `DELETE` своего personal → 200
- [ ] `GET` чужого personal by id → 404
- [ ] Invalid body → 422

---

## SAFE TO COMMIT

| Проверка | Статус |
|----------|--------|
| Scope = API only | ✅ |
| Build green | ✅ |
| Tests 93/93 | ✅ |
| No secrets in diff | ✅ |
| No migration applied | ✅ (не применялась) |
| Depends on PR #1 + PR #2 | ✅ (commits `539077a`, `1e901ed` на `main`) |

**Вердикт: SAFE TO COMMIT** — PR #3 готов к отдельному коммиту поверх PR #2.

**Примечание:** PR #2 (`1e901ed`) ещё не запушен на `origin/main`. Рекомендуемый порядок: push PR #1+#2, затем commit PR #3.

---

## Следующий шаг

**PR #4:** `NAV_CALENDAR`, middleware `/calendar`, `CalendarView` shell, toolbar, fetch events from UI.
