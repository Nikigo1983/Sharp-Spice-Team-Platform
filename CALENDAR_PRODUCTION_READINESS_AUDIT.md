# Calendar Production Readiness Audit

**Дата:** 2026-06-22  
**Объект:** Calendar MVP после PR #1–#7 (7 коммитов локально на `main`)  
**Метод:** статический аудит кода, миграций, API, RBAC, store layer — без deploy и без применения migration  
**Вердикт в конце:** **NOT PRODUCTION READY**

---

## Executive Summary

| Область | Статус |
|---------|--------|
| Data layer (schema, store, repo) | ✅ Готов в коде |
| API + RBAC (server) | ✅ Готов |
| UI Month + Day + CRUD | ✅ Готов |
| Week View | ❌ Placeholder |
| Migration 009 на Supabase | ❌ Не применена |
| Persistence на Vercel (без Supabase) | ❌ Непригодно |
| Full MVP QA / polish (PR #9) | ❌ Не завершён |
| Изоляция от CRM / AI / Sheets | ✅ Нет пересечений |

Календарь **технически зрелый как модуль**, но **production deploy сейчас заблокирован** отсутствием миграции, незавершённым MVP (Week View) и отсутствием production smoke test на реальной БД.

---

## 1. Что уже готово для production

### Backend (PR #1–#3)

| Компонент | Статус | Детали |
|-----------|--------|--------|
| `009_calendar.sql` | ✅ В репозитории | Таблица `calendar_events`, CHECK constraints, 3 индекса |
| `store.ts` | ✅ | Dual-storage: Supabase primary, `.data/calendar-events.json` fallback |
| `calendar-events-repo.ts` | ✅ | CRUD через `service_role` |
| REST API | ✅ | 5 endpoints, session auth |
| `permissions.ts` | ✅ | Матрица owner/manager |
| `validation.ts` | ✅ | Title, dates, scope |
| Unit tests | ✅ | permissions, validation, handlers, range, format, month, form |

### App shell + UI (PR #4–#7)

| Компонент | Статус |
|-----------|--------|
| Nav `/calendar` + middleware | ✅ |
| Month grid (default view) | ✅ |
| Day agenda | ✅ |
| Layer filters + legend | ✅ (часть PR #9 сделана досрочно) |
| CRUD UI (create / view / edit / delete) | ✅ |
| RBAC в UI (`permissions-client.ts`) | ✅ |
| Toast + refetch после мутаций | ✅ |
| `npm test` 123/123, `npm run build` | ✅ |

### Безопасность приложения

| Проверка | Статус |
|----------|--------|
| API требует `getSession()` | ✅ |
| Personal events: list filter по `ownerUserId` | ✅ |
| POST: `ownerUserId` из session, не из body | ✅ |
| Чужой personal → 404 (не 403) | ✅ |
| Company edit: creator или owner | ✅ |

---

## 2. Что ещё блокирует production deploy

| # | Блокер | Severity | Описание |
|---|--------|----------|----------|
| 1 | **Migration 009 не применена** | **Critical** | При настроенном Supabase `listEventsInRange` падает → store возвращает `[]`; create/update/delete — ошибки |
| 2 | **Week View не реализован** | **High** | MVP spec требует 3 режима; переключатель «Неделя» показывает placeholder |
| 3 | **7 коммитов не на `origin/main`** | **High** | Код не в remote; риск потери, CI/CD не видит изменения |
| 4 | **Нет production smoke test** | **High** | CRUD на prod Supabase после migration не проверен |
| 5 | **JSON fallback на Vercel** | **Critical** (если без Supabase) | `.data/` ephemeral — данные теряются при redeploy |
| 6 | **Silent failure при list** | **Medium** | `store.listEventsInRange` при ошибке Supabase логирует и возвращает `[]` — пользователь видит пустой календарь без ошибки |
| 7 | **PR #9 polish не завершён** | **Medium** | Mobile default day view, loading skeleton, полный manual QA checklist |
| 8 | **Нет мониторинга/алертов** | **Low** | Ошибки `[calendar] supabase *` только в server logs |

---

## 3. Нужно ли менять migration 009_calendar.sql

**Вердикт: НЕТ — менять не нужно для текущего MVP.**

| Критерий | Соответствие |
|----------|--------------|
| Поля vs `CalendarEvent` type | ✅ 1:1 |
| CHECK `personal` → `owner_user_id` | ✅ |
| CHECK `end_at >= start_at` | ✅ |
| Индексы для list by range | ✅ |
| `company_id` default `sharp-spice` | ✅ |

**Не включено (и не требуется для MVP):**

- `client_id`, `task_id`, `source_ref` — Phase 2 (см. `INTERNAL_CALENDAR_SYSTEM_DESIGN.md`)
- RLS policies — см. §8

**Действие:** применить **как есть** в Supabase SQL Editor.

---

## 4. Есть ли проблемы с RBAC

### Server-side — **в целом корректно**

| Сценарий | Реализация | Тесты |
|----------|------------|-------|
| Personal view/edit/delete — только owner | ✅ | ✅ |
| Company view — все auth users | ✅ | ✅ |
| Company edit — creator или owner | ✅ | ✅ |
| Manager не редактирует чужой company | ✅ | ✅ |
| Create personal/company | ✅ | ✅ |

### UI — **согласовано с server**

`permissions-client.ts` re-export из `permissions.ts`; кнопки Edit/Delete скрыты без прав.

### Замечания (не блокеры MVP)

| Замечание | Risk | Комментарий |
|-----------|------|-------------|
| `sbListEventsInRange` загружает **все** personal events компании на сервер | Low | Фильтрация по `ownerUserId` в app layer; до клиента чужие personal не доходят; при 4 пользователях приемлемо |
| Scope immutable при edit | OK | По spec — scope не меняется после create |
| Нет audit log мутаций | Low | Out of scope MVP |

**Вердикт RBAC:** **проблем, блокирующих production, нет** при условии что API — единственная точка доступа (service_role, не anon key).

---

## 5. Есть ли проблемы с API

| Endpoint | Auth | RBAC | Валидация | Замечания |
|----------|------|------|-----------|-----------|
| `GET /api/calendar/events` | ✅ | ✅ filter | ✅ range | Silent `[]` если таблицы нет |
| `POST /api/calendar/events` | ✅ | ✅ | ✅ | 201 + event |
| `GET /api/calendar/events/[id]` | ✅ | ✅ 404 | — | |
| `PATCH /api/calendar/events/[id]` | ✅ | ✅ 403 | ✅ | Forbidden fields → 422 |
| `DELETE /api/calendar/events/[id]` | ✅ | ✅ 403 | — | |

### Известные риски API

1. **Нет rate limiting** — как у остальных API платформы; для 4 пользователей OK.
2. **`/api/calendar/*` не в middleware matcher** — защита через `getSession()` в route handlers (паттерн платформы).
3. **Нет ETag / caching headers** — не критично для MVP.
4. **Ошибки Supabase при list маскируются** — см. `store.ts:89-91`.

**Вердикт API:** **готов к production** после применения migration и smoke test.

---

## 6. Есть ли проблемы с fallback storage (.data)

| Аспект | Локальная разработка | Vercel production |
|--------|---------------------|-------------------|
| Путь | `.data/calendar-events.json` | Ephemeral filesystem |
| Персистентность | ✅ Между перезапусками dev | ❌ Теряется при redeploy |
| Git | ✅ В `.gitignore` | — |
| Активация | `SUPABASE_*` пустые | Только если Supabase не настроен |

### Поведение store

```
isSupabaseConfigured() === true  →  Supabase only (no JSON fallback on error for list)
isSupabaseConfigured() === false →  JSON file
```

**Критично для production:**

- **Обязательно** `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` на Vercel.
- **Нельзя** полагаться на `.data/calendar-events.json` на production.

**Вердикт:** fallback **безопасен для dev**, **непригоден для prod**.

---

## 7. Что произойдёт после применения migration в Supabase

### До migration (текущее prod-поведение при настроенном Supabase)

```
GET /api/calendar/events  → 200 { events: [] }   (ошибка таблицы проглочена)
POST /api/calendar/events → 500 / error           (insert fails)
```

### После `009_calendar.sql`

1. Таблица `calendar_events` создана с constraints и индексами.
2. **List** начнёт возвращать реальные события из БД.
3. **Create / Update / Delete** через UI заработают с персистентным хранением.
4. **Данные переживут** redeploy Vercel.
5. **Существующие данные** в JSON fallback **не мигрируют автоматически** — если были mock-данные локально, на prod таблица будет пустой (ожидаемо).

### SQL для применения

```sql
-- Файл: supabase/migrations/009_calendar.sql
-- Выполнить целиком в Supabase → SQL Editor
```

Проверка после применения:

```sql
select count(*) from calendar_events;
```

---

## 8. Нужно ли создавать RLS policies сейчас

**Вердикт: НЕТ — не обязательно для текущего deploy.**

| Факт | Вывод |
|------|-------|
| Все миграции платформы (001–009) **без RLS** | Единый паттерн |
| Доступ к БД через `SUPABASE_SERVICE_ROLE_KEY` | RLS bypass при service role |
| RBAC в `handlers.ts` + `permissions.ts` | App-layer security |

RLS имел бы смысл если:

- появится **anon/authenticated** Supabase client в браузере;
- потребуется **defense-in-depth** при утечке service role;
- Phase 2 с прямым client-side доступом.

**Рекомендация:** оставить без RLS для MVP; задокументировать в Phase 2. Не блокирует production при текущей архитектуре.

---

## 9. Какие ENV нужны для production

### Обязательные (календарь + платформа)

| Переменная | Назначение | Новая для календаря? |
|------------|------------|----------------------|
| `AUTH_SECRET` | Session JWT | Нет |
| `AUTH_PASSWORD_*` | Логин сотрудников | Нет |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Нет (уже для tasks/chat) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access | Нет |

### Не нужны для календаря

| Переменная | Причина |
|------------|---------|
| `OPENROUTER_*` | AI out of scope |
| `GOOGLE_SHEETS_*` | CRM/Sheets out of scope |
| `CRM_WRITE_*` | CRM out of scope |
| Calendar-specific ENV | **Не существует** — by design |

### Проверка на Vercel

```
NEXT_PUBLIC_SUPABASE_URL     →  set, non-empty
SUPABASE_SERVICE_ROLE_KEY    →  set, server-only
AUTH_SECRET                    →  set, 32+ chars
```

---

## 10. Может ли календарь повлиять на CRM, AI Workspace, Lead Review или Google Sheets

**Вердикт: НЕТ прямого влияния.**

| Модуль | Связь с календарём | Риск при deploy |
|--------|-------------------|-----------------|
| **CRM / Leads** | Нет импортов `calendar` в `src/lib/leads`, `src/app/api/crm` | ✅ Нет |
| **AI Workspace** | Нет импортов в `src/lib/ai` | ✅ Нет |
| **Lead Review** | Нет shared tables / triggers | ✅ Нет |
| **Google Sheets** | Нет интеграции | ✅ Нет |
| **Tasks** | Отдельная таблица; паттерн store аналогичен | ✅ Нет shared migration |
| **Team Chat** | Нет пересечения | ✅ Нет |
| **Dashboard** | Только иконка `fa-calendar-check` (не модуль) | ✅ Косметика |

Календарь — **изолированный модуль**: собственная таблица, API namespace `/api/calendar/*`, UI `/calendar`.

**Regression risk:** низкий — изменения в `permissions.ts` (nav) и `middleware.ts` уже в PR #4; остальные разделы не затронуты.

---

## PRE-DEPLOY CHECKLIST

### Код и git

- [ ] `git push` — 7 коммитов PR #1–#7 на `origin/main`
- [ ] `npm test` → 123/123 green
- [ ] `npm run build` → success
- [ ] Review diff: только calendar + nav/middleware (PR #4)

### Supabase

- [ ] Применить `supabase/migrations/009_calendar.sql` в **production** Supabase project
- [ ] Проверить: `select * from calendar_events limit 1` — без ошибки
- [ ] Убедиться: `NEXT_PUBLIC_SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` на Vercel **указывают на тот же проект**

### Vercel ENV

- [ ] `AUTH_SECRET` — production-grade (не dev default)
- [ ] `AUTH_PASSWORD_*` — bcrypt hashes (не plain dev passwords)
- [ ] Supabase vars — set
- [ ] **Нет** `.env.development.local` с пустыми `SUPABASE_*` на production

### Функциональная готовность (решение команды)

- [ ] Принять deploy **без Week View** (placeholder) **ИЛИ** дождаться PR #8 Week View
- [ ] Согласовать: пустой календарь на prod после migration — OK

### Smoke test (staging или prod под owner + manager)

- [ ] `GET /calendar` — auth redirect без cookie
- [ ] Login → Month grid отображается
- [ ] Create personal event → виден только создателю
- [ ] Create company event → виден обоим managers
- [ ] Edit own / 403 на чужой company (manager B)
- [ ] Owner edit чужой company — OK
- [ ] Delete с confirm
- [ ] Day view + chip click → modal
- [ ] Regression: `/tasks`, `/clients`, `/ai-workspace` — открываются

---

## POST-DEPLOY CHECKLIST

### Немедленно после deploy

- [ ] `/calendar` — 200 для auth user
- [ ] Network: `GET /api/calendar/events` → 200, не пустой после create
- [ ] Создать тестовое company-событие → видно у всех
- [ ] Удалить тестовое событие
- [ ] Проверить Vercel logs — нет `[calendar] supabase list` errors

### В первые 24 часа

- [ ] Менеджеры создали реальные консультации (personal)
- [ ] Owner создал company-событие (если нужно)
- [ ] Данные сохраняются после redeploy (Supabase persistence)
- [ ] Нет жалоб на пустой календарь при наличии событий

### Мониторинг

- [ ] Vercel Function logs: watch `[calendar] supabase`
- [ ] Supabase Dashboard: table size `calendar_events`

### Follow-up (не блокирует первый deploy)

- [ ] PR #8 — Week View
- [ ] PR #9 — polish + full QA
- [ ] Улучшить error UX при Supabase failure (не silent `[]`)
- [ ] Опционально: backup/export script для `calendar_events`

---

## Вердикт

# NOT PRODUCTION READY

### Почему

1. **Migration 009 не применена** — без неё календарь на production с Supabase фактически неработоспособен (пустой list, ошибки write).
2. **MVP не завершён по spec** — Week View остаётся placeholder; PR #9 (polish/QA) не сделан.
3. **Код не на remote** — 7 коммитов только локально; нет CI/CD path to production.
4. **Нет подтверждённого smoke test** на реальной Supabase после migration.

### Что нужно для PRODUCTION READY

| Шаг | Effort |
|-----|--------|
| Push PR #1–#7 на `origin/main` | Минуты |
| Применить `009_calendar.sql` на prod Supabase | 5 мин |
| Smoke test CRUD (owner + 2 managers) | 30 мин |
| Решение по Week View: deploy без / wait | Решение команды |
| (Рекомендуется) PR #9 polish | ~0.5–1 день |

### Условный fast-track

Если команда **сознательно принимает** deploy **без Week View**:

> После **push + migration + smoke test** календарь можно считать **PRODUCTION READY для ограниченного MVP** (Month + Day + CRUD), с явным disclaimer: режим «Неделя» — placeholder.

---

## Связанные документы

- `CALENDAR_MVP_SPEC.md` — exit criteria
- `CALENDAR_MVP_STATUS_REPORT.md` — статус PR #1–#7
- `REPORT_PR7_CRUD_UI.md` — CRUD UI
- `supabase/migrations/009_calendar.sql` — DDL для deploy

---

**Документ подготовлен без написания кода, commit, push, deploy и применения migration.**
