# Calendar MVP — Status Report

**Дата:** 2026-06-22  
**Ветка:** `main` (6 коммитов впереди `origin/main`, PR #1–#6 закоммичены локально)  
**Основа:** `CALENDAR_MVP_SPEC.md`, `CALENDAR_IMPLEMENTATION_PLAN.md`  
**Статус:** аналитический отчёт — код, commit, push, deploy и migration **не выполнялись**

---

## Executive Summary

| Метрика | Значение |
|---------|----------|
| PR завершено | **6 / 9** (PR #1–#6) |
| Оценка готовности MVP | **~68%** |
| Режимы просмотра | Month ✅ · Day ✅ · Week ⏳ |
| CRUD через UI | ❌ (API готов) |
| Production-ready | ❌ (миграция 009 не применена, push не выполнен) |
| Рекомендуемый следующий PR | **PR #8 — CRUD UI** |

---

## 1. Что реализовано (PR #1–#6)

### PR #1 — Schema + Repository + Store (`539077a`)

| Компонент | Статус |
|-----------|--------|
| `supabase/migrations/009_calendar.sql` | ✅ В репозитории |
| `src/lib/calendar/types.ts`, `constants.ts` | ✅ |
| `src/lib/supabase/calendar-events-repo.ts` | ✅ |
| `src/lib/calendar/store.ts` | ✅ Dual-storage: Supabase / `.data/calendar-events.json` |
| Миграция на prod | ❌ Не применялась |

### PR #2 — RBAC + Validation (`1e901ed`)

| Компонент | Статус |
|-----------|--------|
| `permissions.ts` — матрица owner/manager | ✅ |
| `validation.ts` — create/update/range | ✅ |
| Unit tests | ✅ `permissions.test.ts`, `validation.test.ts` |
| Store вызывает validation перед write | ✅ |

### PR #3 — REST API (`334783d`)

| Endpoint | Статус |
|----------|--------|
| `GET /api/calendar/events` | ✅ List по диапазону + scopes |
| `POST /api/calendar/events` | ✅ Create |
| `GET /api/calendar/events/[id]` | ✅ |
| `PATCH /api/calendar/events/[id]` | ✅ |
| `DELETE /api/calendar/events/[id]` | ✅ |
| Session auth + RBAC + IDOR-защита | ✅ |
| Handler tests | ✅ |

### PR #4 — Navigation + Shell (`c813f45`)

| Компонент | Статус |
|-----------|--------|
| Пункт «Календарь» в sidebar (manager + owner) | ✅ |
| `middleware.ts` — защита `/calendar` | ✅ |
| `src/app/(app)/calendar/page.tsx` | ✅ |
| `CalendarView`, `CalendarToolbar`, `CalendarEmptyState` | ✅ |
| `range.ts` — диапазоны month/week/day, URL sync | ✅ |
| Fetch событий через API | ✅ |
| `CalendarLayerFilters` + `layers.ts` | ✅ *(часть scope PR #9 реализована досрочно)* |
| Кнопка «+ Создать событие» | 🔒 Disabled (ждёт PR #8) |

### PR #5 — Day View (`2c76d57`)

| Компонент | Статус |
|-----------|--------|
| `CalendarDayAgenda` — agenda выбранного дня | ✅ |
| `CalendarEventChip` — время, название, scope, цвета | ✅ |
| `format.ts` — сортировка, all-day секция, `eventsForDay` | ✅ |
| Навигация ◀ ▶ / Сегодня в day mode | ✅ |
| URL `?view=day&date=YYYY-MM-DD` | ✅ |
| Пустой день → `CalendarEmptyState` | ✅ |
| Unit tests (`format.test.ts`) | ✅ |

### PR #6 — Month View (`279fb35`)

| Компонент | Статус |
|-----------|--------|
| `CalendarMonthGrid` — сетка Пн–Вс, 4–6 недель | ✅ |
| `month.ts` — `buildMonthMatrix`, overflow | ✅ |
| События в ячейках (`CalendarEventChip` variant `month`) | ✅ |
| Цвета personal / company | ✅ `#3B82F6` / `#22C55E` |
| Max 3 chip + «+N ещё» | ✅ |
| Клик по дню → Day View | ✅ |
| Today highlight | ✅ |
| Навигация ◀ ▶ / Сегодня в month mode | ✅ |
| Пустой месяц — сетка без empty state | ✅ |
| Unit tests (`month.test.ts`) | ✅ |
| `npm test` | ✅ 114/114 · `npm run build` ✅ |

---

## 2. Что осталось до MVP

| PR | Название | Оценка | Зависимости | Ключевой результат |
|----|----------|--------|-------------|-------------------|
| **#7** | Week View | ~2 дня | PR #4, #5 | Почасовая сетка Пн–Вс, 07:00–20:00, all-day row |
| **#8** | CRUD UI | ~1.5 дня | PR #3, #4 | Создание / просмотр / редактирование / удаление через UI |
| **#9** | Filters + Polish | ~0.5–1 день | PR #5–#8 | Финальный QA, mobile default, error/loading polish |

### Частично уже сделано (вне плана PR #9)

- Фильтры слоёв (`CalendarLayerFilters`) — в PR #4
- `localStorage` для слоёв — в PR #4
- Легенда цветов — в PR #4
- Server-side `scopes` в API — в PR #3

### Что останется в PR #9 после досрочной реализации фильтров

- Mobile: default `view=day` при ширине < 768px
- Loading skeleton / улучшенный error state
- Полный manual QA по `CALENDAR_MVP_SPEC.md` §11.2
- Deploy checklist: migration 009, smoke test на prod

### Exit criteria MVP (ещё не выполнены)

Из `CALENDAR_MVP_SPEC.md`:

> Сотрудник открывает `/calendar`, видит личные и корпоративные события, **создаёт / редактирует / удаляет** события в рамках своих прав.

| Критерий | Статус |
|----------|--------|
| Три режима просмотра | ⏳ 2/3 (нет Week) |
| CRUD через UI | ❌ |
| RBAC в UI (кнопки Edit/Delete) | ❌ |
| Vertical slice end-to-end | ❌ |
| Production deploy + migration | ❌ |

---

## 3. Какие риски остались

| Риск | Severity | Описание | Митигация |
|------|----------|----------|-----------|
| **Миграция 009 не применена** | **High** | На prod с Supabase API возвращает `[]` (таблица не существует) | Применить `009_calendar.sql` перед deploy |
| **Календарь read-only** | **High** | Менеджеры не могут вести расписание без PR #8 | Приоритет PR #8 |
| **JSON fallback на prod** | **High** | Ephemeral FS на Vercel — данные не персистентны | Только Supabase на production |
| **Week View — overlap layout** | Medium | Пересекающиеся события, scroll sync | MVP: vertical stack; Day как fallback |
| **TZ Europe/Zagreb** | Medium | События на границе дня могут «переехать» | Уже централизовано в `range.ts` / `format.ts`; QA в PR #9 |
| **Chip click no-op** | Low | Клик по событию не открывает детали | PR #8 — модалка |
| **6 коммитов не на origin** | Medium | Потеря при сбое локальной машины | Push после review |
| **Scope creep (CRM, AI)** | Low | Давление связать календарь с клиентами | Freeze по §10 spec |
| **Фильтры частично в PR #4** | Low | PR #9 может быть меньше плана | Учесть при оценке сроков |

---

## 4. Что можно показать менеджерам уже сейчас

**Условие:** локальный `npm run dev` + mock-данные в `.data/calendar-events.json` (или Supabase после migration 009).

### ✅ Можно демонстрировать

| Возможность | Как показать |
|-------------|--------------|
| Раздел «Календарь» в меню | `/calendar` |
| Обзор месяца | Default view — сетка с событиями, Today, ◀ ▶ |
| Детали дня | Клик по ячейке → Day View |
| Личные vs компания | Синие / зелёные chip; фильтры слоёв |
| Расписание одного дня | Переключатель «День», agenda с временем |
| All-day события | Секция «Весь день» в Day View |
| Deep link | `?view=month&date=2026-06-19` |
| Приватность личных событий | Два аккаунта manager — personal A не виден B |

### ⚠️ С оговорками

| Возможность | Оговорка |
|-------------|----------|
| Демо на production | Не работает без migration 009 |
| Week View | Placeholder «скоро» |
| Создание события | Кнопка видна, но **disabled** |

### Рекомендуемый сценарий демо (5 мин)

1. Открыть `/calendar` — месяц с company + personal событиями  
2. Показать фильтры: скрыть/показать слой  
3. Кликнуть день с событиями → Day View  
4. Переключить ◀ ▶ по дням  
5. Объяснить: «Создание событий — в следующем релизе»

---

## 5. Что нельзя использовать до завершения MVP

| Нельзя | Почему |
|--------|--------|
| **Production-календарь как рабочий инструмент** | Нет CRUD UI; migration не применена |
| **Запись консультаций через платформу** | Create disabled; только API (curl) |
| **Координация подач документов через календарь** | События нельзя создать/изменить в UI |
| **Week View для планирования слотов** | Не реализован |
| **Клик по событию → детали** | Chip no-op до PR #8 |
| **Уведомления о событиях** | Out of scope MVP |
| **Связка с CRM / клиентами** | Phase 2 |
| **AI-планирование** | Out of scope |
| **Drag & drop перенос событий** | Out of scope |
| **JSON fallback на Vercel** | Данные не сохраняются между деплоями |

---

## 6. Оценка готовности в %

### По PR (количество)

```
6 / 9 PR = 67%
```

### По трудозатратам (из плана)

| Этап | Дни (план) | Статус |
|------|------------|--------|
| PR #1–#6 | 6.75 | ✅ |
| PR #7–#9 | 4.5 | ⏳ |
| **Итого** | **11.25** | **~60% по effort** |

### По функциональным блокам

| Блок | Вес | Готовность | Взвешенно |
|------|-----|------------|-----------|
| Data layer (store, migration) | 15% | 95%* | 14.3% |
| Security (RBAC, validation) | 10% | 100% | 10% |
| API (CRUD endpoints) | 15% | 100% | 15% |
| App shell + nav | 10% | 100% | 10% |
| Read UI (3 views) | 25% | 67% (2/3) | 16.7% |
| Write UI (CRUD) | 20% | 0% | 0% |
| Polish + QA + deploy | 5% | 30% | 1.5% |
| **Итого** | **100%** | | **~68%** |

\*Migration SQL есть, но не применена на prod (−5%).

### Вердикт

**~68% готовности MVP** — фундамент и read-only UI сильные; главный gap — **CRUD UI** и **Week View**.

---

## 7. Нужно ли менять порядок оставшихся PR?

### Текущий план

```
PR #7 Week View  →  PR #8 CRUD UI  →  PR #9 Polish
```

### Факт после PR #6

- Month (default view) — ✅ закрыт главный UX-разрыв  
- Day View — ✅ покрывает ежедневную работу  
- Фильтры — ✅ частично перенесены из PR #9 в PR #4  

### Рекомендуемый порядок

```
PR #8 CRUD UI  →  PR #7 Week View  →  PR #9 Polish
```

| Изменение | Обоснование |
|-----------|-------------|
| **PR #8 перед PR #7** | Без CRUD календарь остаётся витриной; exit criteria MVP требуют create/edit/delete |
| **PR #7 не отменять** | Spec требует 3 режима; Week нужен для почасового планирования |
| **PR #9 уменьшить** | Фильтры уже есть; остаётся QA + mobile + deploy |

**Вывод:** порядок **стоит изменить** — CRUD важнее Week для Sharp & Spice.

---

## A vs B: что принесёт больше пользы следующим шагом?

### Контекст Sharp & Spice

- Агентство релокации: **консультации**, **подачи документов**, **командные встречи**
- Команда: 1 owner + 3 manager (4 пользователя)
- Календарь автономен от CRM в MVP
- Два слоя: **personal** (консультации менеджера) · **company** (подачи, собрания)

---

### A) Week View (PR #7)

| Плюс | Минус |
|------|-------|
| Почасовая сетка — лучший UX для поиска свободного слота | ~2 дня разработки, высокий риск overlap/layout |
| Визуализация пересечений в одной неделе | Owner не видит personal других менеджеров — ценность для координации ограничена |
| Slot-click → create (после PR #8) | **Без PR #8 остаётся read-only** |
| Закрывает 3-й режим из spec | Day View уже частично заменяет для консультаций |

**Типичные сценарии:**

- «Найти свободный час на четверг» — **высокая** ценность для менеджеров  
- «Увидеть company-подачу в пятницу» — средняя (Month + Day тоже работают)

**Оценка пользы сейчас:** ★★★☆☆ (3/5) — полезен, но только для **чтения** до CRUD

---

### B) CRUD UI (PR #8)

| Плюс | Минус |
|------|-------|
| **Замыкает vertical slice** — календарь становится рабочим инструментом | Форма + модалка + RBAC кнопок — объём UI |
| Менеджеры смогут записывать консультации | Slot-click create в Week — только после PR #7 |
| Owner создаёт company-события (подачи, собрания) | |
| Кнопка «+ Создать событие» перестаёт быть disabled | |
| API уже готов и протестирован | |
| Работает с Month + Day **сразу** | |

**Типичные сценарии Sharp & Spice:**

| Сценарий | PR #7 | PR #8 |
|----------|-------|-------|
| Злата записывает консультацию с клиентом | ❌ | ✅ |
| Вероника создаёт «Подача документов — пятница» | ❌ | ✅ |
| Менеджер блокирует время под поездку в консульство | ❌ | ✅ |
| Команда видит общее собрание | ✅ (read) | ✅ (read + edit) |
| Найти свободный слот визуально | ✅ | ⏳ (форма вручную) |

**Оценка пользы сейчас:** ★★★★★ (5/5) — **блокирует реальное adoption**

---

### Сравнительная таблица

| Критерий | A) Week View | B) CRUD UI |
|----------|--------------|------------|
| Разблокирует ежедневную работу менеджеров | ❌ | ✅ |
| Закрывает exit criteria MVP | ❌ | ✅ (частично) |
| Time-to-value | ~2 дня | ~1.5 дня |
| Зависит от других PR | Желателен PR #8 для slot-click | Только PR #3+#4 (готовы) |
| Заменяется Day + Month | Частично | Нет замены |
| Риск реализации | High | Medium |

---

## Рекомендация: следующий PR

### Реализовывать: **PR #8 — CRUD UI**

**Почему:**

1. **Календарь сейчас read-only** — главная боль для Sharp & Spice; менеджеры не могут вести расписание консультаций.
2. **Exit criteria MVP** явно требуют create/edit/delete — без PR #8 MVP не завершён по смыслу, даже при 3 view.
3. **API и RBAC готовы** — PR #8 в основном UI-слой; минимальный риск, максимальный ROI.
4. **Month + Day уже работают** — новые события сразу видны в обоих режимах.
5. **Week без CRUD** — красивая сетка без возможности записи; ценность для бизнеса низкая.
6. После PR #8 → PR #7 (Week) получит slot-click create и станет полноценным инструментом планирования слотов.

### Предлагаемая последовательность

```
PR #8  CRUD UI         ← следующий (рекомендуется)
PR #7  Week View
PR #9  Polish + QA + deploy (migration 009)
```

### Когда пересмотреть

Вернуться к Week-first, если после PR #8 выяснится, что менеджеры **активно** создают события, но **жалуются на отсутствие почасовой сетки** чаще, чем на форму создания.

---

## Приложение: коммиты PR #1–#6

| PR | Hash | Сообщение |
|----|------|-----------|
| #1 | `539077a` | Calendar MVP PR1: |
| #2 | `1e901ed` | Calendar MVP PR2: |
| #3 | `334783d` | Calendar MVP PR3: |
| #4 | `c813f45` | Calendar MVP PR4: |
| #5 | `2c76d57` | Calendar MVP PR5: |
| #6 | `279fb35` | Calendar MVP PR6: month view and calendar grid |

**Push на `origin/main` не выполнялся.**

---

## Связанные документы

- `CALENDAR_MVP_SPEC.md` — спецификация MVP
- `CALENDAR_IMPLEMENTATION_PLAN.md` — план 9 PR
- `WEEK_VS_MONTH_ANALYSIS.md` — анализ приоритета Month vs Week (PR #6 выполнен)
- `REPORT_PR1_CALENDAR.md` … `REPORT_PR6_MONTH_VIEW.md` — отчёты по PR

---

**Документ подготовлен без написания кода, commit, push, deploy и применения migration.**
