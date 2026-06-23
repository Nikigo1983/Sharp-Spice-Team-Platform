# Internal Video Meetings — Go-Live Checklist

**Дата:** 17 июня 2026  
**Аудитория:** owner / ops (без участия разработчика)  
**Связанные документы:** `INTERNAL_VIDEO_MEETINGS_MVP_SPEC`, `INTERNAL_VIDEO_MEETINGS_ARCHITECTURE.md`, `INTERNAL_VIDEO_MEETINGS_IMPLEMENTATION_PLAN.md`

---

## Что включается в MVP

Встроенные видеовстречи в календаре для сотрудников (`owner`, `manager`):

- тип события **«Видеовстреча»** при создании;
- страница `/calendar/meet/{eventId}` (LiveKit Cloud);
- кнопка **«Присоединиться»** в модалке события и в напоминаниях;
- аудит join/leave в Supabase (`calendar_meeting_audit`).

**Не входит:** гостевые ссылки, запись, in-call chat, Zoom/Google Meet.

---

## Предварительные условия

| # | Требование | Где проверить |
|---|------------|---------------|
| 1 | Календарь уже работает на production | `/calendar` |
| 2 | Supabase настроен (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) | Vercel → Environment Variables |
| 3 | Напоминания календаря работают (`CRON_SECRET` на Vercel + GitHub Actions) | `.env.example`, bell-уведомления |
| 4 | Код PR #1–#7 смержен и задеплоен на Vercel | `main` → Production deploy |

---

## Шаг 1 — Миграция Supabase

Применить **до** первого smoke-test на staging/production:

**Файл:** `supabase/migrations/012_calendar_video_meetings.sql`

1. Supabase Dashboard → **SQL Editor** → New query.
2. Вставить содержимое файла → **Run**.
3. Убедиться:
   - `calendar_events.event_type` принимает `general` и `video_meeting`;
   - таблица `calendar_meeting_audit` создана.

Повторный запуск безопасен (`if not exists`, `drop constraint if exists`).

---

## Шаг 2 — LiveKit Cloud (Build plan)

1. Зарегистрироваться / войти: [cloud.livekit.io](https://cloud.livekit.io).
2. Создать проект **Sharp & Spice Internal** (или аналог).
3. **Region:** выбрать **EU** (Frankfurt или ближайший EU) — команда в Европе/Армении.
4. Тариф: **Build ($0)** — достаточно для ~4 сотрудников и 1–2 параллельных комнат.

### Ключи API

Project → **Settings** → **Keys**:

| Переменная Vercel | Значение |
|-------------------|----------|
| `LIVEKIT_URL` | `wss://…livekit.cloud` (WebSocket URL проекта) |
| `LIVEKIT_API_KEY` | API Key |
| `LIVEKIT_API_SECRET` | API Secret |

**Важно:**

- ключи **только на сервере** (Vercel); в браузер не попадают;
- **`NEXT_PUBLIC_LIVEKIT_*` не добавлять** — клиент получает `wsUrl` из API;
- секреты **не коммитить** в git (только placeholders в `.env.example`).

---

## Шаг 3 — Vercel Production

Vercel → Project → **Settings** → **Environment Variables** → **Production**:

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Убедиться, что уже заданы (для audit и календаря):

```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
AUTH_SECRET=...
```

После добавления переменных — **Redeploy** Production (Deployments → … → Redeploy).

---

## Шаг 4 — Локальная разработка (опционально)

Скопировать `.env.example` → `.env.local` и заполнить блок LiveKit + Supabase.

```bash
npm install
npm run dev
```

Без `LIVEKIT_*` join вернёт **503** («LiveKit not configured»).  
Без Supabase audit join/leave вернёт **503** («Meeting audit not configured») — meet при этом может работать, если token API настроен.

---

## Smoke test (staging или production)

Выполнить **двумя** аккаунтами manager/owner. Событие — **не all-day**, тип **«Видеовстреча»**, время **сейчас ±15 мин** (окно доступа: **−15 мин от start … +15 мин после end**).

### Базовый сценарий (desktop Chrome — обязательно)

| # | Действие | Ожидание |
|---|----------|----------|
| 1 | Manager создаёт видеовстречу на ближайшие 10–20 мин | Сохранено, в модалке виден тип «Видеовстреча» |
| 2 | До окна (−15 мин) | Кнопка Join неактивна / статус «ожидание» |
| 3 | В окне — **Присоединиться** из модалки | Страница meet, запрос mic/cam, подключение |
| 4 | Второй сотрудник — Join из своего календяря | Оба видят/слышат друг друга |
| 5 | Screen share (desktop) | Демонстрация экрана видна второму участнику |
| 6 | Выход (**Покинуть**) | Возврат в календарь, комната закрыта локально |
| 7 | Supabase → `calendar_meeting_audit` | Строки `joined` / `left` для обоих пользователей |

### Напоминания

| # | Действие | Ожидание |
|---|----------|----------|
| 8 | Событие с «Напоминания» → дождаться cron / bell | Уведомление с кнопкой **«Присоединиться»** |
| 9 | Клик по кнопке | Открывается `/calendar/meet/{eventId}` |

### Негативные проверки

| # | Сценарий | Ожидание |
|---|----------|----------|
| 10 | Без логина → `/calendar/meet/…` | Редirect на login |
| 11 | Чужое personal-событие (другой manager) | 403 / «нет доступа» |
| 12 | Join вне окна (после end + 15 мин) | 403 / «окно закрыто» |
| 13 | Удалить `LIVEKIT_API_KEY` на preview → Join | 503 |

### Мобильные (best-effort)

| # | Устройство | Минимум |
|---|------------|---------|
| 14 | iPhone Safari | Join + mic + cam |
| 15 | Android Chrome | Join + screen share (если доступно) |

Screen share на iOS может быть ограничен — допустимо сообщение «не поддерживается».

---

## Production checklist (Definition of Done)

Отметить перед объявлением команды:

- [ ] Миграция `012` применена на **production** Supabase
- [ ] `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` в **Vercel Production**
- [ ] Redeploy после добавления ENV
- [ ] Smoke test § «Базовый сценарий» — pass (2 пользователя + screen share)
- [ ] Напоминание → «Присоединиться» → meet page — pass
- [ ] Audit rows в `calendar_meeting_audit` — pass
- [ ] 403 для неавторизованного / чужого события / вне окна — pass
- [ ] Гостевых ссылок нет (только session + ACL)
- [ ] `npm test` + `npm run build` green на `main`

---

## Мониторинг и стоимость

- Dashboard LiveKit → **Usage**: participant-minutes, concurrent connections.
- Build plan: **5 000 participant-minutes/мес** бесплатно — см. расчёт в `INTERNAL_VIDEO_MEETINGS_IMPLEMENTATION_PLAN.md`.
- При стабильном превышении ~5 000 min/мес — рассмотреть **Ship ($50/mo)**.
- Цены: [livekit.com/pricing](https://livekit.com/pricing) — проверять перед апгрейдом.

---

## Troubleshooting

| Симптом | Вероятная причина | Действие |
|---------|-------------------|----------|
| **503** при Join | Нет `LIVEKIT_*` на Vercel | Добавить ENV, redeploy |
| **503** audit | Supabase не настроен | `NEXT_PUBLIC_SUPABASE_URL` + service role |
| Connect fail после token | Неверный secret / URL | Сверить ключи в LiveKit ↔ Vercel |
| **403** outside window | Раньше −15 мин или позже end+15 | Подождать / перенести событие |
| **403** not video meeting | `event_type` ≠ `video_meeting` | Создать новое событие (тип immutable) |
| **404** | Нет события или нет прав просмотра | Проверить ACL календаря |
| Нет напоминаний | `CRON_SECRET` / GitHub Action | См. `CALENDAR_NOTIFICATIONS_IMPLEMENTATION_PLAN.md` |
| Долгий первый Join | Vercel cold start | Норма (+200–800 ms); повторный быстрее |

**Логи:** Vercel → Functions → `/api/calendar/events/[id]/meeting-token`, `meeting-audit`.  
**Не логировать:** значение JWT token, `LIVEKIT_API_SECRET`.

---

## Ссылки

| Документ | Назначение |
|----------|------------|
| `INTERNAL_VIDEO_MEETINGS_ARCHITECTURE.md` | ACL, API, схема |
| `INTERNAL_VIDEO_MEETINGS_UI_WIREFRAMES.md` | UI-поведение |
| `INTERNAL_VIDEO_MEETINGS_IMPLEMENTATION_PLAN.md` | PR-разбивка, риски, стоимость |
| `.env.example` | Все переменные окружения |
