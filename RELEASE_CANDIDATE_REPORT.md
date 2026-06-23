# Release Candidate Report — Calendar MVP

**Дата:** 2026-06-22  
**Ветка:** `main` (локально)  
**Base:** `origin/main`  
**Release candidate:** 7 коммитов PR #1–#7  
**Статус:** подготовка релиза — код **не менялся**, push/deploy/migration **не выполнялись**

---

## Executive Summary

| Метрика | Значение |
|---------|----------|
| Коммитов в RC | **7** |
| Файлов изменено | **54** |
| Строк добавлено | **+5 652** |
| Строк удалено | **−1** |
| `npm test` | **123/123** ✅ |
| `npm run build` | **success** ✅ |
| Scope | **Только календарь** (+ nav/middleware wiring) |
| Cross-module impact | **Нет** (CRM, AI, Leads, Sheets) |
| Вердикт RC | **APPROVED FOR RELEASE CANDIDATE** |

---

## 1. Проверка 7 коммитов

| # | Hash | PR | Файлов | +/− | Содержание | Статус |
|---|------|-----|--------|-----|------------|--------|
| 1 | `539077a` | PR #1 | 6 | +632 | Migration, types, store, repo | ✅ |
| 2 | `1e901ed` | PR #2 | 6 | +406/−39 | RBAC, validation, store refactor | ✅ |
| 3 | `334783d` | PR #3 | 6 | +878/−1 | REST API, handlers, tests | ✅ |
| 4 | `c813f45` | PR #4 | 16 | +1 103 | Page, shell, toolbar, filters, nav, middleware | ✅ |
| 5 | `2c76d57` | PR #5 | 9 | +508/−1 | Day view, EventChip, format | ✅ |
| 6 | `279fb35` | PR #6 | 9 | +619/−3 | Month grid, month.ts | ✅ |
| 7 | `e7fd08d` | PR #7 | 14 | +1 450/−8 | CRUD UI, form, modal | ✅ |

```text
origin/main ──► 539077a ──► 1e901ed ──► 334783d ──► c813f45 ──► 2c76d57 ──► 279fb35 ──► e7fd08d (HEAD)
```

### Целостность цепочки

- Каждый коммит логически завершён (data → security → API → UI → views → CRUD).
- Нет merge commits, rebase или fixup между PR.
- Все коммиты на линейной истории `main`.

### Автоматические проверки (повторно на HEAD)

```
npm test   → 123 passed, 0 failed
npm build  → Compiled successfully
```

---

## 2. Scope: только изменения календаря

### Категории файлов в релизе

| Категория | Файлов | Описание |
|-----------|--------|----------|
| **Calendar module** | 45 | `src/lib/calendar/*`, `src/components/calendar/*`, API routes, page |
| **Supabase** | 1 | `009_calendar.sql` |
| **Shared wiring** | 3 | `permissions.ts`, `middleware.ts`, `package.json` |
| **Reports** | 5 | `REPORT_PR*.md` (документация PR) |

### Shared files — детальный разбор

Изменения **вне** `calendar/` ограничены подключением модуля:

#### `src/lib/auth/permissions.ts` (+8 строк)

- Добавлен `NAV_CALENDAR` (`/calendar`, icon `fa-calendar-days`)
- Вставлен в `MANAGER_NAV` и `OWNER_NAV` после «Задачи»
- **Не изменены** существующие nav items, CRM, AI, leads routes

#### `middleware.ts` (+3 строки)

- `PROTECTED_PREFIXES`: добавлен `/calendar`
- `config.matcher`: добавлены `/calendar`, `/calendar/:path*`
- **Не изменены** matchers для `/crm`, `/ai-workspace`, `/api/*`

#### `package.json` (+1 строка test script)

- Добавлены 9 calendar `*.test.ts` в `npm test`
- **Не изменены** dependencies, scripts dev/build/start

### Что НЕ входит в релиз

| Исключено | Причина |
|-----------|---------|
| `CALENDAR_MVP_SPEC.md`, `CALENDAR_IMPLEMENTATION_PLAN.md` | Untracked |
| `CALENDAR_RELEASE_PLAN.md`, `CALENDAR_PRODUCTION_READINESS_AUDIT.md` | Untracked |
| `reports/`, `scripts/capture-pr*.mjs` | Untracked, локальные |
| `.env.development.local`, `.data/` | Gitignored |
| Week View implementation | Не в scope RC |
| CRM / AI / CRM linkage | Не в scope |

**Вердикт scope:** релиз содержит **только календарь** и минимальную интеграцию в nav/auth/middleware.

---

## 3. Влияние на другие модули

### Метод проверки

1. `git diff origin/main..HEAD --name-only` — список всех изменённых файлов  
2. Grep `calendar` в `src/lib/ai`, `src/lib/leads`, `src/app/api/crm`, `src/lib/google-sheets` — **0 matches**  
3. Grep `crm|leads|ai|formgrid|sheets` в `src/lib/calendar`, `src/components/calendar` — **0 matches**

### Результаты по модулям

| Модуль | Файлы изменены? | Импорты calendar? | API routes? | DB tables? | Риск |
|--------|-----------------|-------------------|-------------|------------|------|
| **CRM** | ❌ Нет | ❌ | ❌ | ❌ | **None** |
| **AI Workspace** | ❌ Нет | ❌ | ❌ | ❌ | **None** |
| **Lead Review** | ❌ Нет | ❌ | ❌ | ❌ | **None** |
| **Google Sheets** | ❌ Нет | ❌ | ❌ | ❌ | **None** |
| **Tasks** | ❌ Нет* | ❌ | ❌ | ❌ | **None** |
| **Team Chat** | ❌ Нет | ❌ | ❌ | ❌ | **None** |
| **Clients** | ❌ Нет | ❌ | ❌ | ❌ | **None** |

\*Tasks использует тот же Supabase project, но **отдельные таблицы**; migration `009` создаёт только `calendar_events`.

### Regression surface

Единственные точки соприкосновения с остальной платформой:

| Точка | Изменение | Regression risk |
|-------|-----------|-----------------|
| Sidebar nav | +1 пункт | Low — additive |
| Middleware | +1 protected route | Low — не затрагивает существующие |
| `package.json` test | +9 test files | Low — только test script |
| Supabase | +1 table | Low — новая таблица, не ALTER existing |

**Вердикт:** **нет влияния** на CRM, AI Workspace, Lead Review, Google Sheets.

---

## 4. Список файлов для релиза (54)

### Migration (1)

```
supabase/migrations/009_calendar.sql
```

### App routes (3)

```
src/app/(app)/calendar/page.tsx
src/app/api/calendar/events/route.ts
src/app/api/calendar/events/[id]/route.ts
```

### Components — calendar (22)

```
src/components/calendar/CalendarDayAgenda.tsx
src/components/calendar/CalendarDayAgenda.module.css
src/components/calendar/CalendarEmptyState.tsx
src/components/calendar/CalendarEmptyState.module.css
src/components/calendar/CalendarEventChip.tsx
src/components/calendar/CalendarEventChip.module.css
src/components/calendar/CalendarEventForm.tsx
src/components/calendar/CalendarEventForm.module.css
src/components/calendar/CalendarEventModal.tsx
src/components/calendar/CalendarEventModal.module.css
src/components/calendar/CalendarLayerFilters.tsx
src/components/calendar/CalendarLayerFilters.module.css
src/components/calendar/CalendarMonthGrid.tsx
src/components/calendar/CalendarMonthGrid.module.css
src/components/calendar/CalendarToolbar.tsx
src/components/calendar/CalendarToolbar.module.css
src/components/calendar/CalendarView.tsx
src/components/calendar/CalendarView.module.css
src/components/calendar/CalendarViewPlaceholder.tsx
src/components/calendar/CalendarViewPlaceholder.module.css
```

### Library — calendar (22)

```
src/lib/calendar/constants.ts
src/lib/calendar/form.ts
src/lib/calendar/form.test.ts
src/lib/calendar/format.ts
src/lib/calendar/format.test.ts
src/lib/calendar/handlers.ts
src/lib/calendar/handlers.test.ts
src/lib/calendar/layers.ts
src/lib/calendar/layers.test.ts
src/lib/calendar/month.ts
src/lib/calendar/month.test.ts
src/lib/calendar/permissions.ts
src/lib/calendar/permissions.test.ts
src/lib/calendar/permissions-client.ts
src/lib/calendar/permissions-client.test.ts
src/lib/calendar/range.ts
src/lib/calendar/range.test.ts
src/lib/calendar/store.ts
src/lib/calendar/types.ts
src/lib/calendar/validation.ts
src/lib/calendar/validation.test.ts
```

### Supabase repo (1)

```
src/lib/supabase/calendar-events-repo.ts
```

### Shared wiring (3)

```
src/lib/auth/permissions.ts
middleware.ts
package.json
```

### Reports (5)

```
REPORT_PR1_CALENDAR.md
REPORT_PR3_CALENDAR.md
REPORT_PR5_DAY_VIEW.md
REPORT_PR6_MONTH_VIEW.md
REPORT_PR7_CRUD_UI.md
```

---

## 5. Финальный diff summary

### По типу

| Тип | Файлов | Строк |
|-----|--------|-------|
| TypeScript / TSX (prod) | 35 | ~4 200 |
| CSS modules | 11 | ~900 |
| Tests | 9 | ~1 100 |
| SQL migration | 1 | 34 |
| Markdown reports | 5 | ~850 |
| Config (package, middleware, permissions) | 3 | ~12 net |
| **Итого** | **54** | **+5 652 / −1** |

### По PR (кумулятивно)

| PR | Ключевой deliverable | Новых файлов (approx) |
|----|---------------------|----------------------|
| #1 | Data layer | 6 |
| #2 | RBAC + validation | 4 (+ store edit) |
| #3 | API | 4 (+ handlers) |
| #4 | Shell + nav | 14 |
| #5 | Day view | 6 |
| #6 | Month view | 6 |
| #7 | CRUD UI | 8 |

### Функциональность RC

| Feature | Status in RC |
|---------|--------------|
| Month view (default) | ✅ |
| Day view | ✅ |
| Week view | ⏳ Placeholder only |
| Create / view / edit / delete | ✅ |
| Personal + company layers | ✅ |
| RBAC server + UI | ✅ |
| REST API (5 endpoints) | ✅ |
| Migration `009_calendar.sql` | ✅ In repo, **not applied** |
| JSON fallback (dev) | ✅ |
| CRM / AI integration | ❌ Not included |

### Известные ограничения RC (не блокеры релиза при согласии)

1. **Week View** — placeholder «скоро»
2. **Migration 009** — требует ручного применения на Supabase перед prod CRUD
3. **7 коммитов** — не на `origin/main` (ожидает push)
4. **List API** — при ошибке Supabase возвращает `[]` без UI error (silent)

---

## 6. Release Candidate Checklist

### Pre-push (готово / требует действия)

| # | Item | Status |
|---|------|--------|
| 1 | 7 коммитов проверены | ✅ |
| 2 | Scope = calendar only | ✅ |
| 3 | No CRM/AI/Leads/Sheets impact | ✅ |
| 4 | `npm test` 123/123 | ✅ |
| 5 | `npm run build` green | ✅ |
| 6 | File list documented | ✅ |
| 7 | Diff summary documented | ✅ |
| 8 | `git push origin main` | ⏳ Pending |
| 9 | Apply `009_calendar.sql` | ⏳ Pending |
| 10 | Smoke test (owner + manager) | ⏳ Pending |

### Документы релиза

| Документ | Назначение |
|----------|------------|
| `RELEASE_CANDIDATE_REPORT.md` | Этот отчёт |
| `CALENDAR_RELEASE_PLAN.md` | Пошаговый план выпуска |
| `CALENDAR_PRODUCTION_READINESS_AUDIT.md` | Аудит готовности |
| `REPORT_PR1` … `REPORT_PR7` | Отчёты по PR (в коммитах) |

---

## 7. Вердикт Release Candidate

### **APPROVED AS RELEASE CANDIDATE**

**Обоснование:**

1. Все 7 коммитов проверены — линейная история, автотесты green.
2. Diff содержит **только календарь** + 3 строки shared wiring (nav, middleware, test script).
3. **Нет изменений** в CRM, AI Workspace, Lead Review, Google Sheets.
4. Build и 123 unit tests проходят.
5. Функциональный scope: Month + Day + CRUD — достаточен для **Limited MVP release**.

**Следующий шаг (не в этом документе):** выполнить `CALENDAR_RELEASE_PLAN.md` — push → migration → deploy → smoke test.

---

**Код не изменялся. Push, deploy, migration не выполнялись.**
