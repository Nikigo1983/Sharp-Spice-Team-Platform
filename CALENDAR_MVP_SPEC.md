# Calendar MVP Spec — Phase 1

**Дата:** 2026-06-20  
**Статус:** спецификация первого релиза — код, миграции, PR, деплой и ENV не затрагиваются  
**Основа:** `INTERNAL_CALENDAR_SYSTEM_DESIGN.md` (Phase 1 — Foundation)  
**Scope:** только встроенный календарь Sharp & Spice без интеграций

---

## Executive Summary

MVP — **самостоятельный модуль календаря** внутри платформы: два типа событий (личное / компания), три режима просмотра, полный CRUD через API и UI. Данные в Supabase; fallback на `.data/calendar-events.json` при отсутствии Supabase (как у задач).

**Не входит в MVP:** CRM, AI, уведомления, дедлайны, automation, multi-tenant UI, Google Calendar.

**Exit criteria MVP:** сотрудник (`manager` или `owner`) открывает `/calendar`, видит личные (синие) и корпоративные (зелёные) события, создаёт / редактирует / удаляет события в рамках своих прав.

---

## 1. Раздел меню «Календарь»

### 1.1. Параметры навигации

| Поле | Значение |
|------|----------|
| `href` | `/calendar` |
| `label` | Календарь |
| `icon` | `fa-solid fa-calendar-days` |
| Роли | `owner`, `manager` |
| Позиция | После «Задачи», перед «Командный чат» |

### 1.2. Изменения в существующих файлах (при реализации)

| Файл | Изменение |
|------|-----------|
| `src/lib/auth/permissions.ts` | `NAV_CALENDAR` в `MANAGER_NAV` и `OWNER_NAV` |
| `middleware.ts` | matcher: `/calendar`, `/calendar/:path*` |

### 1.3. Маршрут

```
src/app/(app)/calendar/page.tsx   — server component, getSession(), redirect /login
```

Отдельных подстраниц (`/calendar/new`) **нет** — создание и редактирование через модальное окно на главной странице (как задачи в `TasksView`).

---

## 2. Режимы просмотра

### 2.1. Три режима

| Режим | Query param | Описание | Приоритет UI |
|-------|-------------|----------|--------------|
| **Месяц** | `view=month` (default) | Сетка 7×5/6, чипы событий в ячейках дня | P0 |
| **Неделя** | `view=week` | Колонки Пн–Вс, слоты 07:00–20:00, шаг 30 мин | P0 |
| **День** | `view=day` | Agenda: список событий выбранного дня по времени | P0 |

### 2.2. Навигация по датам

| Элемент | Поведение |
|---------|-----------|
| `◀` / `▶` | Предыдущий / следующий месяц, неделя или день (зависит от `view`) |
| «Сегодня» | Сброс `anchor` на текущую дату |
| Клик по дню (month) | Переход в `view=day` с этой датой |
| URL state | `?view=week&date=2026-06-20` — deep link и refresh-safe |

### 2.3. Диапазон загрузки данных

| View | API `from` / `to` |
|------|-------------------|
| Month | Первый день месяца − 7 дней … последний день месяца + 7 дней |
| Week | Понедельник 00:00 … воскресенье 23:59 |
| Day | Выбранный день 00:00 … 23:59 |

Часовой пояс MVP: фиксированный `Europe/Zagreb` (константа в `src/lib/calendar/constants.ts`). Таблица `companies` в MVP **не создаётся** — `company_id = 'sharp-spice'` в service layer.

### 2.4. Отображение событий

| `scope` | Цвет | CSS token |
|---------|------|-----------|
| `personal` | Синий | `--calendar-personal: #3B82F6` |
| `company` | Зелёный | `--calendar-company: #22C55E` |

All-day события: полоска в верхней части дня (week/day) или метка «весь день» в month.

---

## 3. Типы событий (MVP)

В MVP **два типа** — через поле `scope`, без детальной таксономии `event_type`.

| Тип (UI) | `scope` | Кто видит | Кто создаёт |
|----------|---------|-----------|-------------|
| **Личное событие** | `personal` | Только владелец (`owner_user_id`) | Любой auth user (для себя) |
| **Событие компании** | `company` | Все сотрудники | `owner` и `manager` |

Поле `event_type` в БД для MVP: всегда `general` (зарезервировано для Phase 2: `consultation`, `document_submission`, …).

### 3.1. Поля события (форма)

| Поле | Обязательное | Личное | Компания |
|------|--------------|--------|----------|
| Название | ✅ | ✅ | ✅ |
| Описание | ❌ | ✅ | ✅ |
| Дата начала | ✅ | ✅ | ✅ |
| Время начала | ✅* | ✅ | ✅ |
| Дата окончания | ✅ | ✅ | ✅ |
| Время окончания | ✅* | ✅ | ✅ |
| Весь день | ❌ | ✅ | ✅ |
| Место | ❌ | ✅ | ✅ |

\* При `all_day = true` время скрыто; `start_at` = 00:00, `end_at` = 23:59:59 в TZ компании.

**Не в форме MVP:** `client_id`, участники, напоминания, повторение.

---

## 4. Возможности (CRUD)

### 4.1. Создать событие

- Кнопка **«+ Создать событие»** в шапке календаря
- Клик по пустому слоту (week/day) → форма с предзаполненной датой/временем
- `POST /api/calendar/events`
- После успеха: обновление локального state + toast «Событие создано»

### 4.2. Просмотреть событие

- Клик по чипу / блоку события → **модалка деталей** (read-only блок + кнопки действий)
- `GET /api/calendar/events/[id]` (опционально; можно использовать данные из list)
- Показывать: название, описание, время, место, тип (личное/компания), автор (`created_by_name`)

### 4.3. Редактировать событие

- Кнопка «Редактировать» в модалке (если `canEditEvent`)
- Та же форма, что при создании
- `PATCH /api/calendar/events/[id]`
- Сервер проверяет права до мутации

### 4.4. Удалить событие

- Кнопка «Удалить» в модалке + confirm dialog
- `DELETE /api/calendar/events/[id]`
- Hard delete в MVP (без `status = cancelled`)

### 4.5. Ошибки

| Код | Ситуация |
|-----|----------|
| 401 | Нет сессии |
| 403 | Нет прав на действие |
| 404 | Событие не найдено или личное чужое (не раскрывать существование) |
| 422 | Валидация (пустой title, `end_at < start_at`) |

---

## 5. Права доступа

### 5.1. Роли

Используются существующие роли из `src/lib/auth/types.ts`: `owner` | `manager`.

### 5.2. Матрица RBAC (MVP)

| Действие | manager | owner |
|----------|---------|-------|
| Открыть `/calendar` | ✅ | ✅ |
| Просмотр **своих** личных событий | ✅ | ✅ |
| Просмотр **чужих** личных событий | ❌ | ❌ |
| Создание личного события | ✅ | ✅ |
| Редактирование своего личного | ✅ | ✅ |
| Удаление своего личного | ✅ | ✅ |
| Просмотр событий компании | ✅ | ✅ |
| Создание события компании | ✅ | ✅ |
| Редактирование **своего** события компании | ✅ | ✅ |
| Редактирование **чужого** события компании | ❌ | ✅ |
| Удаление **своего** события компании | ✅ | ✅ |
| Удаление **чужого** события компании | ❌ | ✅ |

**Правило «своё»:** `event.created_by_user_id === session.id`.

### 5.3. Серверные инварианты

```typescript
// Псевдокод — calendar/permissions.ts

canViewEvent(user, event):
  if event.scope === 'company' → true
  if event.scope === 'personal' → event.owner_user_id === user.id

canEditEvent(user, event):
  if event.scope === 'personal' → event.owner_user_id === user.id
  if event.scope === 'company' → user.role === 'owner' OR event.created_by_user_id === user.id

canCreateEvent(user, body):
  if body.scope === 'personal' → true
  if body.scope === 'company' → true  // оба role в MVP

// При POST personal — server SET owner_user_id = session.id (игнор client)
// При POST — server SET company_id = 'sharp-spice', created_by_user_id = session.id
```

### 5.4. List API scoping

`GET /api/calendar/events` возвращает:

```
личные WHERE owner_user_id = session.id
  UNION
компания WHERE company_id = 'sharp-spice'
```

Никогда не отдавать чужие `personal` события.

---

## 6. UX-сценарии

### S1 — Создание личного события (менеджер)

**Актор:** Злата (`manager-1`)

1. Открывает **Календарь** в сайдбаре
2. Режим **Неделя**, нажимает слот «Чт 19.06 10:00»
3. Открывается форма: тип **Личное событие** (default), название «Консультация с клиентом»
4. Сохраняет → синий блок в сетке
5. Другой менеджер **не видит** это событие

### S2 — Создание события компании (owner)

**Актор:** Вероника (`owner`)

1. `/calendar`, кнопка **+ Создать событие**
2. Тип **Событие компании**, название «Общее собрание», дата пятница 14:00–15:00
3. Сохраняет → зелёный блок у всех сотрудников

### S3 — Просмотр календаря (менеджер)

**Актор:** Юля (`manager-2`)

1. Открывает календарь, режим **Месяц**
2. Видит зелёные company events всех
3. Видит только **свои** синие personal events
4. Клик по зелёному событию → детали, без кнопки «Редактировать» (создала Вероника)

### S4 — Фильтрация событий

**Актор:** любой сотрудник

1. Чекбоксы в шапке:
   - ☑ **Мои события** (`scope=personal`)
   - ☑ **События компании** (`scope=company`)
2. Снять «Мои» → остаются только зелёные
3. Снять «Компания» → остаются только синие личные
4. Состояние фильтров → `localStorage` key `calendar:layers`

### S5 — Owner редактирует чужое company event

**Актор:** Вероника

1. Открывает зелёное событие, созданное менеджером
2. «Редактировать» доступно → меняет время
3. Сохраняет → все видят обновление

### S6 — Пустой календарь (первый вход)

1. Нет событий в диапазоне
2. Empty state: «Нет событий на этот период» + CTA «Создать событие»

### S7 — Supabase не настроен (dev)

1. Fallback `.data/calendar-events.json`
2. CRUD работает локально (как tasks)

---

## 7. Supabase schema MVP

### 7.1. Минимальный набор

MVP — **одна таблица** `calendar_events`. Таблица `companies` откладывается: `company_id` hardcoded.

> При реализации миграция может называться `009_calendar.sql`; в этой спецификации SQL **не создаётся** — только описание целевой схемы.

### 7.2. Таблица `calendar_events`

| Колонка | Тип | NULL | Default | MVP |
|---------|-----|------|---------|-----|
| `id` | `text` | NO | — | PK, UUID v4 |
| `company_id` | `text` | NO | `'sharp-spice'` | Константа |
| `scope` | `text` | NO | — | `personal` \| `company` |
| `owner_user_id` | `text` | YES | — | NOT NULL если `personal` |
| `title` | `text` | NO | — | |
| `description` | `text` | NO | `''` | |
| `event_type` | `text` | NO | `'general'` | Резерв Phase 2 |
| `start_at` | `timestamptz` | NO | — | |
| `end_at` | `timestamptz` | NO | — | |
| `all_day` | `boolean` | NO | `false` | |
| `location` | `text` | NO | `''` | |
| `created_by_user_id` | `text` | NO | — | |
| `created_by_name` | `text` | NO | — | Денормализация для UI |
| `updated_by_user_id` | `text` | YES | — | |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | |

**Constraints (логика приложения + CHECK в миграции):**

```sql
check (scope in ('personal', 'company'))
check (scope <> 'personal' OR owner_user_id is not null)
check (end_at >= start_at)
```

**Индексы:**

```sql
create index calendar_events_range_idx
  on calendar_events (company_id, start_at, end_at);

create index calendar_events_personal_idx
  on calendar_events (owner_user_id, start_at)
  where scope = 'personal';

create index calendar_events_company_idx
  on calendar_events (company_id, start_at)
  where scope = 'company';
```

### 7.3. Что намеренно отсутствует в MVP schema

| Таблица / колонка | Phase |
|-------------------|-------|
| `companies` | Phase 2+ (multi-tenant) |
| `calendar_event_participants` | Phase 2+ |
| `calendar_deadlines` | Phase 2 |
| `calendar_audit_log` | Phase 3 |
| `calendar_automation_rules` | Phase 3 |
| `client_id`, `task_id`, `lead_row_key` | Phase 2 |
| `reminder_minutes`, `source`, `source_ref` | Phase 4 |
| `status` (cancelled/completed) | Phase 2+ |

### 7.4. Локальный fallback

Файл: `.data/calendar-events.json`

```json
{
  "events": [ /* CalendarEvent[] */ ]
}
```

Паттерн: `src/lib/calendar/store.ts` — mirror `src/lib/tasks/store.ts`.

---

## 8. API дизайн

### 8.1. Endpoints (MVP)

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| `GET` | `/api/calendar/events` | session | Список за диапазон |
| `POST` | `/api/calendar/events` | session | Создание |
| `GET` | `/api/calendar/events/[id]` | session | Одно событие |
| `PATCH` | `/api/calendar/events/[id]` | session | Обновление |
| `DELETE` | `/api/calendar/events/[id]` | session | Удаление |

Других endpoints в MVP **нет** (`availability`, `promote`, `clients/[id]/calendar` — Phase 2+).

### 8.2. `GET /api/calendar/events`

**Query parameters:**

| Param | Тип | Обязательный | Описание |
|-------|-----|--------------|----------|
| `from` | ISO 8601 | ✅ | Начало диапазона |
| `to` | ISO 8601 | ✅ | Конец диапазона |
| `scopes` | string | ❌ | `personal,company` (default: оба) |

**Response 200:**

```json
{
  "events": [
    {
      "id": "uuid",
      "companyId": "sharp-spice",
      "scope": "personal",
      "ownerUserId": "manager-1",
      "title": "Консультация",
      "description": "",
      "eventType": "general",
      "startAt": "2026-06-19T08:00:00.000Z",
      "endAt": "2026-06-19T09:00:00.000Z",
      "allDay": false,
      "location": "",
      "createdByUserId": "manager-1",
      "createdByName": "Злата",
      "updatedByUserId": null,
      "createdAt": "2026-06-18T12:00:00.000Z",
      "updatedAt": "2026-06-18T12:00:00.000Z"
    }
  ]
}
```

**Сортировка:** `start_at ASC`.

### 8.3. `POST /api/calendar/events`

**Body:**

```json
{
  "scope": "personal",
  "title": "Встреча",
  "description": "Опционально",
  "startAt": "2026-06-19T08:00:00.000Z",
  "endAt": "2026-06-19T09:00:00.000Z",
  "allDay": false,
  "location": "Офис"
}
```

**Server-side defaults:**

- `id` → `crypto.randomUUID()`
- `companyId` → `'sharp-spice'`
- `eventType` → `'general'`
- `ownerUserId` → `session.id` if `scope === 'personal'`, else `null`
- `createdByUserId` → `session.id`
- `createdByName` → `session.name`

**Response 201:** `{ "event": { ... } }`

### 8.4. `PATCH /api/calendar/events/[id]`

**Body (partial):**

```json
{
  "title": "Новое название",
  "startAt": "...",
  "endAt": "...",
  "allDay": true,
  "description": "...",
  "location": "..."
}
```

**Запрещено менять в MVP:** `scope`, `ownerUserId`, `companyId`, `createdByUserId`.

**Response 200:** `{ "event": { ... } }`

### 8.5. `DELETE /api/calendar/events/[id]`

**Response 200:** `{ "ok": true }`

### 8.6. Слой сервиса

```
src/lib/calendar/
  types.ts          — CalendarEvent, CreateEventInput, UpdateEventInput
  permissions.ts    — canViewEvent, canEditEvent, canDeleteEvent
  validation.ts     — validateEventInput, parseRange
  store.ts          — listEvents, getEvent, createEvent, updateEvent, deleteEvent
  constants.ts      — COMPANY_ID, TIMEZONE, COLORS

src/lib/supabase/
  calendar-events-repo.ts  — sbListEvents, sbInsertEvent, ...
```

`store.ts` выбирает Supabase или JSON по `isSupabaseConfigured()`.

---

## 9. UI дизайн

### 9.1. Структура страниц

```
src/app/(app)/calendar/
  page.tsx                 — getSession(), <AppShell><CalendarView user={session} /></AppShell>
```

Одна страница; состояние view/date/filters — client state + URL search params.

### 9.2. Дерево компонентов

```
CalendarView.tsx              — контейнер: data fetch, filters, view switch
├── CalendarToolbar.tsx       — заголовок, ◀▶, Сегодня, Day|Week|Month, + Создать
├── CalendarLayerFilters.tsx  — ☑ Мои / ☑ Компания
├── CalendarMonthGrid.tsx     — view=month
├── CalendarWeekGrid.tsx      — view=week
├── CalendarDayAgenda.tsx     — view=day
├── CalendarEventChip.tsx     — чип в ячейке (цвет по scope)
├── CalendarEventModal.tsx    — просмотр + edit/delete actions
├── CalendarEventForm.tsx     — форма create/edit (внутри modal)
├── CalendarLegend.tsx        — синий / зелёный
└── CalendarEmptyState.tsx    — нет событий
```

### 9.3. CSS Modules

```
src/components/calendar/
  CalendarView.module.css
  CalendarToolbar.module.css
  CalendarMonthGrid.module.css
  CalendarWeekGrid.module.css
  CalendarDayAgenda.module.css
  CalendarEventChip.module.css
  CalendarEventModal.module.css
  CalendarEventForm.module.css
```

Стиль: переиспользовать токены из `TasksView` / `AppShell` (`Card`, `Button`, `SectionHeader`).

### 9.4. Wireframe — Toolbar

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Календарь                                                                │
│                                                                          │
│  [◀]  Июнь 2026  [▶]  [Сегодня]     [День] [Неделя] [Месяц]  [+ Создать] │
│                                                                          │
│  ☑ Мои события   ☑ События компании          ● Личное  ● Компания        │
└──────────────────────────────────────────────────────────────────────────┘
```

### 9.5. Wireframe — Week view

```
        Пн 16      Вт 17      Ср 18      Чт 19      Пт 20      Сб 21   Вс 22
       ─────────────────────────────────────────────────────────────────────
07:00  │
08:00  │           ┌──────────┐
09:00  │           │Консультац│ синий
10:00  │           └──────────┘
  ...  │
14:00  │                              ┌─────────────┐
15:00  │                              │Общее собран.│ зелёный
       │                              └─────────────┘
```

### 9.6. Wireframe — Event modal

```
┌─ Консультация с клиентом ──────────────────────── [×] ─┐
│  Тип: Личное событие                                    │
│  19 июня 2026, 10:00 – 11:00                            │
│  Место: —                                               │
│  Описание: ...                                          │
│  Создал: Злата                                          │
│                                                         │
│              [Редактировать]  [Удалить]  [Закрыть]      │
└─────────────────────────────────────────────────────────┘
```

### 9.7. Форма создания

- Radio / segmented control: **Личное** | **Компания**
- Поля: название, описание (textarea), дата+время начала/конца, checkbox «Весь день», место
- Валидация client-side: title не пустой, end ≥ start
- Submit → POST или PATCH

### 9.8. Responsive (MVP)

| Breakpoint | Поведение |
|------------|-----------|
| Desktop | Week + Month полноценно |
| Tablet | Week горизонтальный scroll |
| Mobile | Default `view=day`; month упрощён (список дней) |

Mobile polish — nice-to-have в MVP; минимум — day view работает.

---

## 10. Что НЕ входит в MVP

| Исключено | Phase | Причина |
|-----------|-------|---------|
| AI Calendar Assistant | 4 | Отдельный intent + context slice |
| CRM automation | 3 | Требует hooks в Sheets / lead review |
| Lead Review integration | 3 | `create_in_crm` → calendar event |
| Уведомления (reminder, deadline) | 4 | Cron + новые notification types |
| Дедлайны из CRM (virtual orange layer) | 2 | `parse-crm-dates.ts`, overlay |
| Привязка к `client_id` | 2 | Карточка клиента |
| Google Calendar | — | Противоречит требованию |
| Multi-tenant (несколько компаний) | 5 | Один `company_id` константа |
| `calendar_event_participants` | 2+ | Участники встреч |
| `calendar_audit_log` | 3 | Журнал изменений |
| `calendar_deadlines` | 2 | All-day дедлайны |
| Drag-and-drop перенос событий | 2+ | UX enhancement |
| Повторяющиеся события (RRULE) | 5 | Сложность |
| Dashboard widget «Сегодня» | 2 | Зависит от стабильного API |
| Интеграция с задачами | 2 | `task_id` link |
| Детальные `event_type` | 2 | consultation, submission, … |
| RLS policies | 5 | Application-level RBAC достаточен для MVP |
| Owner read чужих личных календарей | 3 | Privacy |

---

## 11. Тестирование (MVP)

### 11.1. Unit tests

| Файл | Что тестировать |
|------|-----------------|
| `calendar/permissions.test.ts` | RBAC матрица §5.2 |
| `calendar/validation.test.ts` | end ≥ start, personal requires owner |
| `calendar/store.test.ts` | list filtering by scope + date range (mock repo) |

### 11.2. Ручной test plan

| # | Шаг | Ожидание |
|---|-----|----------|
| 1 | Manager создаёт personal event | Виден только ему |
| 2 | Manager создаёт company event | Виден всем |
| 3 | Manager B не видит personal A | List не содержит чужие |
| 4 | Manager не редактирует чужой company | 403 |
| 5 | Owner редактирует чужой company | 200 |
| 6 | Фильтр «только компания» | Синие скрыты |
| 7 | Month / Week / Day switch | URL и данные обновляются |
| 8 | Delete с confirm | Событие исчезает |
| 9 | Без Supabase (dev) | JSON fallback работает |

---

## 12. Оценка реализации

### 12.1. Сложность

| Область | Сложность | Комментарий |
|---------|-----------|-------------|
| Supabase schema + repo | **Низкая** | Одна таблица, паттерн как tasks |
| API (5 handlers) | **Низкая** | CRUD + session + permissions |
| Permissions | **Низкая** | ~80 строк, по образцу tasks |
| UI Month view | **Средняя** | Сетка + размещение чипов |
| UI Week view | **Средняя–Высокая** | Почасовая сетка, overlap |
| UI Day view | **Низкая** | Список |
| Form + Modal | **Низкая** | Аналог TaskForm |
| Nav + middleware | **Низкая** | 2 файла |
| Тесты | **Низкая** | permissions + validation |
| **Итого** | **Средняя** | Основной риск — week grid UX |

### 12.2. Количество файлов (оценка)

| Категория | Новые | Изменённые | Итого |
|-----------|-------|------------|-------|
| Migration SQL | 1 | 0 | 1 |
| `src/lib/calendar/*` | 6 | 0 | 6 |
| `src/lib/supabase/calendar-events-repo.ts` | 1 | 0 | 1 |
| `src/app/api/calendar/**` | 2 | 0 | 2 |
| `src/app/(app)/calendar/page.tsx` | 1 | 0 | 1 |
| `src/components/calendar/**` | 12–14 | 0 | 12–14 |
| Tests | 2–3 | 0 | 2–3 |
| Nav / middleware / permissions | 0 | 2 | 2 |
| **Итого** | **~25–28** | **~2** | **~27–30 файлов** |

### 12.3. Предполагаемое время разработки

Оценка для **1 разработчика**, знакомого с кодовой базой:

| Этап | Дни | Deliverable |
|------|-----|-------------|
| Schema + repo + store + types | 1.5 | Данные и CRUD layer |
| permissions + validation + tests | 1 | RBAC покрыт тестами |
| API routes | 1 | 5 endpoints |
| CalendarView shell + toolbar + filters | 1 | Навигация, fetch |
| Month grid | 1.5 | view=month |
| Week grid | 2 | view=week |
| Day agenda | 0.5 | view=day |
| Event modal + form | 1.5 | CRUD UI |
| Nav + middleware + polish | 0.5 | Интеграция в app |
| QA + bugfix | 1.5 | Manual test plan |
| **Итого** | **~12 рабочих дней** | **~2.5 недели** |

При парной разработке (backend + frontend параллельно): **~8–10 рабочих дней (~2 недели)**.

### 12.4. Риски MVP

| Риск | Митигация |
|------|-----------|
| Week view overlap events | MVP: колонка stack, без side-by-side columns |
| TZ bugs | Одна константа `Europe/Zagreb`, тесты на DST edge |
| IDOR личных событий | Strict filter в list + canView на GET by id |
| Scope creep (CRM layer) | Жёсткий freeze по §10 |

---

## 13. Порядок реализации (рекомендуемый)

```
1. types + constants + permissions + validation + tests
2. calendar-events-repo + store (Supabase + JSON)
3. API routes
4. page.tsx + CalendarView + Toolbar + fetch
5. Day view (быстрый vertical slice)
6. Event form + modal (CRUD end-to-end)
7. Month view
8. Week view
9. Layer filters + URL state + nav/middleware
10. Manual QA по test plan §11.2
```

**Vertical slice checkpoint (день 4–5):** day view + create personal event + list API — можно показать демо.

---

## 14. Связь с полным дизайном

| `INTERNAL_CALENDAR_SYSTEM_DESIGN.md` | MVP Spec |
|--------------------------------------|----------|
| Hybrid Persisted + Virtual | Только **Persisted** (personal + company) |
| `companies` table | Константа `sharp-spice` |
| 12 `event_type` values | Только `general` |
| `calendar_deadlines` | Phase 2 |
| AI `needsCalendar` | Phase 4 |
| Orange CRM overlay | Phase 2 |
| Phase 1 exit criteria | ✅ Выполняется упрощённым MVP |

---

**Документ подготовлен без изменений кода, миграций, PR, деплоя и ENV.**
