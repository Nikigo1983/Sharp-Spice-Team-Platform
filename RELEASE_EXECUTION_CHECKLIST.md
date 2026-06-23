# Release Execution Checklist — Calendar MVP

**Дата:** 2026-06-22  
**Релиз:** Calendar MVP (PR #1–#7, 7 коммитов)  
**Scope:** Month + Day + CRUD · Week View = placeholder  
**Статус документа:** чеклист — **ничего не выполнено** (push / PR / merge / migration / deploy)

**Связанные документы:** `RELEASE_CANDIDATE_REPORT.md`, `CALENDAR_RELEASE_PLAN.md`, `CALENDAR_PRODUCTION_READINESS_AUDIT.md`

---

## Перед стартом (Pre-flight)

Выполнить **до** push. Отметить все пункты:

- [ ] `git log origin/main..HEAD --oneline` — ровно **7** коммитов (`539077a` … `e7fd08d`)
- [ ] `npm test` → **123/123**
- [ ] `npm run build` → success
- [ ] Vercel ENV: `AUTH_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — set на **production** project
- [ ] Доступ к Supabase SQL Editor (production project)
- [ ] Доступ к GitHub и Vercel dashboard
- [ ] Owner (Вероника) и manager (Злата) доступны для smoke test (~30 мин)
- [ ] Команда принимает **Limited MVP** (Week View = placeholder)

**Исполнитель Pre-flight:** _______________ **Дата:** _______________

---

## 1. Push

### 1.1 Проверка локального состояния

```powershell
cd "c:\Users\Nika\Desktop\Sharp & Spice Team Platform"
git status
git log origin/main..HEAD --oneline
```

- [ ] Working tree clean (или только untracked docs — **не** добавлять их в push)
- [ ] На `main`, 7 коммитов ahead of `origin/main`
- [ ] Нет незакоммиченных изменений в calendar-коде

### 1.2 Push на remote

**Вариант A — через release branch (рекомендуется при branch protection):**

```powershell
git checkout -b release/calendar-mvp
git push -u origin release/calendar-mvp
```

**Вариант B — прямой push на main (если нет branch protection):**

```powershell
git push origin main
```

- [ ] Push завершён без ошибок
- [ ] Remote branch: `release/calendar-mvp` **или** `main` обновлён
- [ ] **Не** делать `git push --force`

**URL remote branch:** _______________  
**Исполнитель:** _______________ **Время:** _______________

---

## 2. GitHub PR

### 2.1 Создание Pull Request

```powershell
gh pr create --base main --head release/calendar-mvp --title "Calendar MVP (PR #1–#7)" --body-file -
```

Или через GitHub UI: **Compare & pull request**

### 2.2 Содержание PR

**Title:** `Calendar MVP (PR #1–#7)`

**Body (минимум):**

```markdown
## Summary
- Calendar data layer + migration 009_calendar.sql
- REST API + RBAC
- Month + Day views + CRUD UI
- Week View: placeholder (Limited MVP)

## Commits (7)
539077a PR1 · 1e901ed PR2 · 334783d PR3 · c813f45 PR4 · 2c76d57 PR5 · 279fb35 PR6 · e7fd08d PR7

## Post-merge required
- [ ] Apply supabase/migrations/009_calendar.sql on production Supabase
- [ ] Smoke test owner + manager

## Out of scope
CRM, AI, Lead Review, Google Sheets integration
```

- [ ] PR создан
- [ ] Base: `main`
- [ ] Diff: **54 files**, только calendar + nav/middleware
- [ ] CI checks (если есть) — дождаться green

**PR URL:** _______________  
**Исполнитель:** _______________ **Время:** _______________

---

## 3. Merge

### 3.1 Review

- [ ] Diff просмотрен — нет посторонних файлов (CRM, AI, `.env`, `reports/`)
- [ ] 7 коммитов в PR соответствуют RC
- [ ] Approve от reviewer (если требуется)

### 3.2 Merge в main

- [ ] Merge method: **Merge commit** (сохранить историю 7 PR) или Squash — по политике команды
- [ ] **Не** squash, если нужна трассировка PR #1–#7 (рекомендуется merge commit)
- [ ] PR merged
- [ ] Локально: `git pull origin main` (после merge)

**Merge commit SHA:** _______________  
**Исполнитель:** _______________ **Время:** _______________

---

## 4. Применение `009_calendar.sql`

### 4.1 Подготовка

- [ ] Открыть **production** Supabase project (тот же, что в Vercel `NEXT_PUBLIC_SUPABASE_URL`)
- [ ] Файл: `supabase/migrations/009_calendar.sql`
- [ ] Убедиться: таблица `calendar_events` **ещё не существует** (или `IF NOT EXISTS` безопасен)

### 4.2 Выполнение

1. Supabase Dashboard → **SQL Editor**
2. Вставить содержимое `009_calendar.sql` целиком
3. **Run**

- [ ] SQL выполнен без ошибок
- [ ] Сообщение: Success / no error

### 4.3 Верификация

```sql
-- Проверка таблицы
select count(*) from calendar_events;

-- Проверка индексов
select indexname from pg_indexes where tablename = 'calendar_events';
```

Ожидание:

- [ ] `calendar_events` существует
- [ ] `count(*)` = 0 (пустая таблица на старте)
- [ ] Индексы: `calendar_events_range_idx`, `calendar_events_personal_idx`, `calendar_events_company_idx`

**Supabase project:** _______________  
**Исполнитель:** _______________ **Время:** _______________

> ⚠️ Migration должна быть применена **до** smoke test на production, **желательно до** первого захода пользователей на `/calendar`.

---

## 5. Проверка Vercel deploy

### 5.1 Триггер deploy

- [ ] Merge в `main` запустил production deployment (или redeploy вручную)

### 5.2 Статус deployment

Vercel Dashboard → Project → Deployments → latest on `main`

- [ ] Status: **Ready** (не Error / Canceled)
- [ ] Build logs: Compiled successfully
- [ ] Commit SHA совпадает с merge commit

### 5.3 ENV на Vercel

Settings → Environment Variables → Production

- [ ] `NEXT_PUBLIC_SUPABASE_URL` — set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — set
- [ ] `AUTH_SECRET` — set (не dev default)
- [ ] Нет пустых override `SUPABASE_*`

### 5.4 Быстрая проверка до smoke

- [ ] `https://<production-domain>/login` — открывается
- [ ] `https://<production-domain>/calendar` без cookie → redirect `/login`
- [ ] Vercel Function logs — нет `[calendar] supabase` errors при первом заходе

**Production URL:** _______________  
**Deployment URL:** _______________  
**Исполнитель:** _______________ **Время:** _______________

---

## 6. Smoke test — Owner

**Аккаунт:** Вероника (`owner`)  
**URL:** `https://<production-domain>/calendar`  
**Время:** ~15 мин

| # | Шаг | OK | Fail | N/A |
|---|-----|:--:|:----:|:---:|
| 1 | Login → sidebar: пункт «Календарь» | ☐ | ☐ | ☐ |
| 2 | `/calendar` → month grid загружается | ☐ | ☐ | ☐ |
| 3 | «+ Создать событие» → модалка | ☐ | ☐ | ☐ |
| 4 | Create **company** event (зелёный) | ☐ | ☐ | ☐ |
| 5 | Toast «Событие создано» | ☐ | ☐ | ☐ |
| 6 | Chip в month grid | ☐ | ☐ | ☐ |
| 7 | Клик chip → view modal | ☐ | ☐ | ☐ |
| 8 | Edit → Save → toast «Обновлено» | ☐ | ☐ | ☐ |
| 9 | F5 — событие на месте | ☐ | ☐ | ☐ |
| 10 | Day view — событие в agenda | ☐ | ☐ | ☐ |
| 11 | Create **personal** event (синий) | ☐ | ☐ | ☐ |
| 12 | Delete company event → confirm | ☐ | ☐ | ☐ |
| 13 | Week tab → placeholder (OK) | ☐ | ☐ | ☐ |
| 14 | ◀ ▶ / Сегодня работают | ☐ | ☐ | ☐ |
| 15 | Фильтры слоёв скрывают company | ☐ | ☐ | ☐ |

### Network (опционально, DevTools)

- [ ] `GET /api/calendar/events` → **200**
- [ ] `POST /api/calendar/events` → **201**
- [ ] `PATCH` → **200**, `DELETE` → **200**

### Supabase Table Editor

- [ ] Строки появляются в `calendar_events` после create
- [ ] Строка удалена после delete

**Owner smoke:** ☐ PASS · ☐ FAIL  
**Исполнитель:** _______________ **Время:** _______________  
**Заметки при Fail:** _______________

---

## 7. Smoke test — Manager

**Аккаунт 1:** Злата (`manager-1`)  
**Аккаунт 2:** Юля (`manager-2`) — для privacy check  
**Предусловие:** company event от owner (шаг 6.4)  
**Время:** ~15 мин

| # | Шаг | OK | Fail | N/A |
|---|-----|:--:|:----:|:---:|
| 1 | Login Злата → `/calendar` загружается | ☐ | ☐ | ☐ |
| 2 | Видит company event от owner | ☐ | ☐ | ☐ |
| 3 | Create personal «Smoke — консультация» | ☐ | ☐ | ☐ |
| 4 | F5 — personal на месте | ☐ | ☐ | ☐ |
| 5 | View modal по клику на chip | ☐ | ☐ | ☐ |
| 6 | Edit own personal — OK | ☐ | ☐ | ☐ |
| 7 | Edit чужой company — кнопка **скрыта** | ☐ | ☐ | ☐ |
| 8 | Login Юля — personal Златы **не виден** | ☐ | ☐ | ☐ |
| 9 | Company event виден у Юли | ☐ | ☐ | ☐ |
| 10 | Personal Юли — только у Юли | ☐ | ☐ | ☐ |
| 11 | Delete own personal — OK | ☐ | ☐ | ☐ |
| 12 | Day view — agenda корректна | ☐ | ☐ | ☐ |
| 13 | Пустой день — «Создать» активна | ☐ | ☐ | ☐ |

**Manager smoke:** ☐ PASS · ☐ FAIL  
**Исполнитель:** _______________ **Время:** _______________  
**Заметки при Fail:** _______________

---

## 8. Regression (5 мин)

Быстрая проверка, что релиз не сломал другие модули:

| # | Route | OK | Fail |
|---|-------|:--:|:----:|
| 1 | `/tasks` | ☐ | ☐ |
| 2 | `/clients` | ☐ | ☐ |
| 3 | `/ai-workspace` | ☐ | ☐ |
| 4 | `/crm/leads` | ☐ | ☐ |
| 5 | `/team-chat` | ☐ | ☐ |

**Regression:** ☐ PASS · ☐ FAIL

---

## 9. Критерии успешного запуска

Релиз считается **успешным**, если выполнены **все** пункты:

### Обязательные (MUST)

| # | Критерий | ☐ |
|---|----------|:-:|
| S1 | PR merged в `main` без конфликтов | ☐ |
| S2 | Vercel production deployment **Ready** | ☐ |
| S3 | `009_calendar.sql` применена на **production** Supabase | ☐ |
| S4 | `calendar_events` таблица существует, CRUD пишет в БД | ☐ |
| S5 | Owner smoke test **PASS** (§6) | ☐ |
| S6 | Manager smoke test **PASS** (§7) | ☐ |
| S7 | Personal events **не видны** другим managers (шаг 7.8) | ☐ |
| S8 | Company events **видны** всей команде | ☐ |
| S9 | Regression §8 — все 5 routes OK | ☐ |
| S10 | Нет `[calendar] supabase` errors в Vercel logs при smoke | ☐ |

### Допустимые ограничения (известные, не fail)

| # | Ограничение | Принято |
|---|-------------|:-------:|
| L1 | Week View = placeholder | ☐ |
| L2 | Пустой календарь на старте (нет seed data) | ☐ |
| L3 | PR #9 polish не в релизе | ☐ |

### Блокеры (любой = релиз НЕ успешен)

| # | Условие | Обнаружено? |
|---|---------|:-----------:|
| B1 | CRUD не сохраняет в Supabase | ☐ |
| B2 | Утечка personal events между users | ☐ |
| B3 | `/calendar` 500 или white screen | ☐ |
| B4 | CRM / AI / Tasks сломаны после deploy | ☐ |
| B5 | Migration failed / wrong Supabase project | ☐ |

---

## 10. Финальное решение

Заполнить после завершения §1–§9:

| Поле | Значение |
|------|----------|
| **Результат** | ☐ **RELEASE SUCCESS** · ☐ **RELEASE FAILED** |
| Merge SHA | |
| Migration applied | ☐ Да · ☐ Нет — время: |
| Vercel deployment | |
| Owner smoke | ☐ PASS · ☐ FAIL |
| Manager smoke | ☐ PASS · ☐ FAIL |
| Дата/время GO LIVE | |
| Анонс команде | ☐ Отправлен |

### При SUCCESS — шаблон анонса

> Календарь доступен в меню «Календарь».  
> Работает: месяц, день, создание / редактирование / удаление.  
> Личные (синие) — только вы. Компания (зелёные) — вся команда.  
> Режим «Неделя» — в следующем релизе.

### При FAIL — действия

1. Зафиксировать шаг и симптом (скриншот + Network + Vercel logs)
2. **Не** удалять `calendar_events` без согласования
3. Rollback: Vercel → Promote previous deployment (`CALENDAR_RELEASE_PLAN.md` §5)
4. Hotfix → новый PR → повторить чеклист с §2

---

## Порядок выполнения (краткая шпаргалка)

```text
Pre-flight → Push → GitHub PR → Merge
    → 009_calendar.sql (Supabase)
    → Vercel deploy Ready
    → Smoke owner → Smoke manager → Regression
    → RELEASE SUCCESS / FAILED
```

**Ориентировочное время:** 45–60 минут.

---

## Подписи

| Роль | Имя | Подпись | Дата |
|------|-----|---------|------|
| Dev (push, PR, migration) | | | |
| Reviewer (merge approve) | | | |
| Owner (smoke §6) | | | |
| Manager (smoke §7) | | | |

---

**Документ подготовлен без изменений кода, push, deploy и migration.**
