# Platform Security Audit

**Дата:** 2026-06-17  
**Scope:** полный аудит безопасности Sharp & Spice Team Platform (код, миграции, ENV, интеграции)  
**Статус:** только документация — код и деплой не менялись  
**Связанные документы:** `AI_DATA_CLASSIFICATION.md`, `SECURITY_PHASE_A_REPORT.md`, `AI_GUARDRAILS_AND_SECURITY_AUDIT.md`

---

## Краткий вывод

| Метрика | Значение |
|---------|----------|
| **Общая оценка риска платформы** | **HIGH** |
| API routes проверено | 37 / 37 с `getSession()` |
| Supabase RLS policies | **0** (миграции `001`–`008`) |
| Server actions | 2 (`signInAction`, `signOutAction`) |
| Admin-only страницы | `/analytics`, `/settings` |
| Debug endpoints | 2 HTTP + 1 chat-команда |
| Service-role клиенты | 2 (platform + Emigrant Desk) |

Платформа рассчитана на **закрытую команду из 4 учёток** (1 owner + 3 manager). Большинство API защищены сессией, но **нет ролевой модели на уровне API** (кроме Analytics и части team-chat). База данных полностью доступна через `SUPABASE_SERVICE_ROLE_KEY` без RLS. Google-интеграции используют широкие scope и отключённую проверку TLS.

**Security Phase A** (redaction `appPassword`) закрывает часть AI-рисков; остаются RBAC, RLS, TLS, публичный CSV и утечки через debug/OpenRouter.

---

## Сводная таблица находок

| ID | Область | Находка | Severity |
|----|---------|---------|----------|
| F-01 | Google Sheets | Публичный CSV-экспорт CRM (`export?format=csv&gid=`) обходит аутентификацию платформы — доступ определяется только настройками Google Sheet | **CRITICAL** |
| F-02 | TLS | `rejectUnauthorized: false` на всех HTTPS-запросах к Google (не только fallback) — риск MITM и кражи SA-токена / `GOOGLE_PRIVATE_KEY` | **HIGH** |
| F-03 | Supabase RLS | Ни одной RLS policy во всех миграциях; полный доступ к БД при утечке service role | **HIGH** |
| F-04 | Service role | Весь доступ к Postgres/Storage через `getSupabaseAdmin()` + `SUPABASE_SERVICE_ROLE_KEY` | **HIGH** |
| F-05 | API / RBAC | `/api/*` не в middleware; единственная защита — per-route `getSession()` без ролевых проверок | **HIGH** |
| F-06 | CRM write | `PATCH /api/crm/leads/[id]` → `create_in_crm` доступен **любому** авторизованному менеджеру | **HIGH** |
| F-07 | Google Sheets scope | Service account: `spreadsheets` (полный write) + `drive.readonly`; при утечке ключа — изменение CRM | **HIGH** |
| F-08 | Google Drive API | `GET /api/knowledge-base?folderId=` — произвольный `folderId` без проверки принадлежности KB root | **HIGH** |
| F-09 | Debug endpoints | `clients-diagnostic` отдаёт сэмплы с паспортами; доступен любому auth user | **HIGH** |
| F-10 | Debug chat | `/debug_client` в AI Workspace — raw scan строк CRM/Formgrid любому auth user | **HIGH** |
| F-11 | Emigrant Desk | Второй service role (`EMIGRANT_SUPABASE_SERVICE_ROLE_KEY`) — расширение blast radius | **HIGH** |
| F-12 | AUTH_PASSWORD | Поддержка plain-text паролей в ENV; bcrypt опционален | **HIGH** |
| F-13 | OpenRouter | `internalComment`, `notes`, `ClientNote.text` уходят в LLM (см. `AI_DATA_CLASSIFICATION.md`) | **MEDIUM** |
| F-14 | Middleware gap | Новый API route без `getSession()` не блокируется middleware | **MEDIUM** |
| F-15 | Admin pages | `/settings` — только middleware, без server-side `getSession()` + role check на странице | **MEDIUM** |
| F-16 | Team permissions | Удаление участников — hardcoded `veronika` + `manager-1`, не по роли `owner` | **MEDIUM** |
| F-17 | Auth brute-force | Нет rate limiting / lockout на `signInAction` | **MEDIUM** |
| F-18 | JWT session | Cookie `ss_session`, 7 дней, без rotation / revoke list | **MEDIUM** |
| F-19 | `.env.example` | Реальные `spreadsheetId`, `folderId`, email сотрудников в репозитории | **MEDIUM** |
| F-20 | Storage RLS | Buckets `public: false`, но нет storage policies в SQL — защита только через API | **MEDIUM** |
| F-21 | AI API abuse | `POST /api/ai-workspace` без rate limit / quota per user | **MEDIUM** |
| F-22 | CRM write flags | `CRM_WRITE_ENABLED=false`, `CRM_WRITE_DRY_RUN=true` по умолчанию — снижает риск | **LOW** (mitigation) |
| F-23 | Dev credentials | `DemoCredentials` + dev-пароли только при `NODE_ENV !== "production"` | **LOW** |
| F-24 | Dev secrets | Fallback `AUTH_SECRET` и `AUTH_PASSWORD_*` только в non-production | **LOW** |
| F-25 | Session cookie | `httpOnly`, `secure` в prod, `sameSite: lax` | **LOW** |
| F-26 | Analytics API | Owner gate на page + `GET /api/analytics/croatia` | **LOW** (positive) |
| F-27 | Workspace chats | Scoping по `session.id` в repo и API | **LOW** (positive) |
| F-28 | Notifications | `markNotificationRead` / `delete` с `.eq("user_id", session.id)` | **LOW** (positive) |
| F-29 | Phase A redaction | `appPassword` redacted в debug, transport, OpenRouter, logs | **LOW** (positive) |
| F-30 | `sheets-health` | Только counts/source — минимальная чувствительность | **LOW** |

---

## 1. Supabase RLS policies

### Состояние

Проверены миграции `supabase/migrations/001_platform.sql` … `008_team_chat_files.sql`.

| Таблица / объект | RLS enabled | Policies |
|------------------|-------------|----------|
| `tasks` | ❌ | — |
| `team_chat_messages` | ❌ | — |
| `team_chat_last_seen` | ❌ | — |
| `ai_workspace_chats` | ❌ | — |
| `client_notes` | ❌ | — |
| `notifications` | ❌ | — |
| `app_state` | ❌ | — |
| `user_presence` | ❌ | — |
| Storage: `task-attachments` | `public: false` | нет SQL policies |
| Storage: `team-chat-audio` | `public: false` | нет SQL policies |
| Storage: `team-chat-images` | `public: false` | нет SQL policies |
| Storage: `team-chat-files` | `public: false` | нет SQL policies |

**Grep по `supabase/`:** `RLS`, `POLICY`, `row level` — **0 совпадений**.

### Архитектура доступа

Весь доступ идёт через серверный `getSupabaseAdmin()`:

```8:26:src/lib/supabase/server.ts
export function getSupabaseAdmin(): SupabaseClient {
  // ...
  adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    // ...
  );
}
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` **не используется** — прямого клиентского доступа к PostgREST нет.

### Оценка: **HIGH** (F-03)

RLS отсутствует by design, но это **single point of failure**: утечка `SUPABASE_SERVICE_ROLE_KEY` (Vercel logs, CI, backup, compromised server) даёт полный read/write всех таблиц и storage. Нет defense-in-depth при ошибке в application-layer scoping.

### Рекомендации

1. Включить RLS на всех таблицах; policies «deny all» для `anon` и `authenticated`.
2. Оставить service role только для server; при необходимости — отдельные DB roles с ограниченными grants.
3. Добавить storage policies: доступ только через signed URLs с проверкой auth на сервере.

---

## 2. Публичные API routes

### Инвентаризация (37 routes)

Все маршруты в `src/app/api/**/route.ts` вызывают `getSession()` и возвращают `401` без сессии.

| Группа | Routes | Auth | Role gate |
|--------|--------|------|-----------|
| AI Workspace | `route`, `chats`, `chats/[id]`, `clients-diagnostic`, `sheets-health` | ✅ session | ❌ |
| Clients / CRM | `clients/*`, `crm/leads/*`, `formgrid-leads` | ✅ session | ❌ |
| Tasks | `tasks`, `tasks/[id]`, attachments | ✅ session | partial (task ACL) |
| Team chat | `team-chat/*` | ✅ session | clear → owner only |
| Team | `team`, `team/[id]` | ✅ session | delete → hardcoded IDs |
| Notifications | `notifications/*` | ✅ session | user-scoped |
| Presence | `presence`, `heartbeat` | ✅ session | ❌ |
| Knowledge Base | `knowledge-base` | ✅ session | ❌ folderId unchecked |
| Analytics | `analytics/croatia` | ✅ session | ✅ owner |

### Middleware

```73:104:middleware.ts
export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard",
    // ... страницы приложения ...
    "/settings",
    "/settings/:path*",
  ],
};
```

**`/api` не в matcher.** Защита API — только в каждом handler. Сегодня покрытие 100%, но **регрессия при добавлении нового route без `getSession()`** не блокируется автоматически.

### Оценка

| Находка | Severity |
|---------|----------|
| Нет middleware на `/api` | **MEDIUM** (F-14) |
| Нет RBAC на большинстве routes | **HIGH** (F-05) |
| CRM `create_in_crm` для всех managers | **HIGH** (F-06) |
| Knowledge Base arbitrary `folderId` | **HIGH** (F-08) |

### Рекомендации

1. Wrapper `withAuth()` / `withRole("owner")` для всех API handlers.
2. ESLint rule или CI grep: каждый `route.ts` должен импортировать `getSession`.
3. Ограничить `create_in_crm`, `clients-diagnostic`, team delete по роли owner или explicit allowlist.

---

## 3. Server actions

### Инвентаризация

Единственный файл с `"use server"`:

| Action | Файл | Проверки |
|--------|------|----------|
| `signInAction` | `src/app/login/actions.ts` | email lookup, `isUserDeleted`, `verifyUserPassword`, `canAccessPath` для redirect |
| `signOutAction` | `src/app/login/actions.ts` | `destroySession` |

Других server actions в `src/` **не найдено**.

### Оценка: **MEDIUM** (F-17)

`signInAction` не имеет rate limiting — возможен offline brute-force по 4 известным email (адреса в `users.ts` и `.env.example`).

### Рекомендации

- Rate limit по IP + email (Vercel middleware, Upstash, или in-memory с TTL).
- Задержка при неверном пароле (constant-time уже частично через bcrypt).
- Опционально: CAPTCHA после N неудач.

---

## 4. Admin-only страницы

### Owner-only (middleware + permissions)

| Path | Middleware `canAccessPath` | Server check | API check |
|------|---------------------------|--------------|-----------|
| `/analytics` | ✅ manager → redirect | ✅ `session.role !== "owner"` | ✅ `analytics/croatia` |
| `/settings` | ✅ manager → redirect | ❌ нет | N/A (placeholder) |

```128:147:src/lib/auth/permissions.ts
const OWNER_ONLY_PREFIXES = ["/analytics", "/settings"];
```

```6:9:src/app/(app)/analytics/page.tsx
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/dashboard");
```

`/settings` — заглушка «в разработке», но **доступ к URL** для owner есть; server-side проверки роли на page нет.

### Оценка

| Находка | Severity |
|---------|----------|
| `/settings` без server-side role check | **MEDIUM** (F-15) |
| `/analytics` корректно защищён | **LOW** positive (F-26) |

### Рекомендации

- Добавить на каждую owner-only page: `getSession()` + `role !== "owner"` (как в analytics).
- При появлении settings API — owner gate на уровне API.

---

## 5. ENV variables

### Инвентарь (`.env.example` + grep `process.env`)

| Переменная | Класс | Client exposure | Примечание |
|------------|-------|-----------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Internal | ✅ public prefix | Только URL, без ключа |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sensitive** | ❌ server-only | `import "server-only"` |
| `EMIGRANT_SUPABASE_URL` | Internal | ❌ | |
| `EMIGRANT_SUPABASE_SERVICE_ROLE_KEY` | **Sensitive** | ❌ server-only | |
| `AUTH_SECRET` | **Sensitive** | ❌ | Обязателен в prod; dev fallback |
| `AUTH_PASSWORD_*` (×4) | **Sensitive** | ❌ | Plain or bcrypt |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | **Sensitive** | ❌ | |
| `GOOGLE_PRIVATE_KEY` | **Restricted** | ❌ | PEM в ENV |
| `GOOGLE_SHEETS_*` | Internal/Restricted | ❌ | IDs таблиц, ranges |
| `GOOGLE_DRIVE_*_FOLDER_ID` | Internal | ❌ | |
| `OPENROUTER_API_KEY` | **Restricted** | ❌ | |
| `OPENAI_API_KEY` | **Restricted** | ❌ | fallback |
| `CRM_WRITE_*` | Internal | ❌ | write gates |
| `AI_WORKSPACE_*` | Internal | ❌ | |

### Находки

| ID | Описание | Severity |
|----|----------|----------|
| F-19 | В `.env.example` закомментированы **реальные** `spreadsheetId`, `folderId`; в `users.ts` — реальные email | **MEDIUM** |
| F-12 | Plain-text пароли допустимы в `verifyUserPassword` | **HIGH** |
| F-23/F-24 | Dev fallbacks для secret/passwords | **LOW** |

`SUPABASE_ANON_KEY` в кодовой базе **отсутствует** — положительно.

### Рекомендации

1. Production: только bcrypt-хеши (`npm run auth:hash-password`).
2. Убрать реальные ID из `.env.example`; использовать placeholders.
3. Vercel: restricted env vars, отдельные preview/production scopes.
4. Ротация `AUTH_SECRET` — процедура invalidate all sessions.

---

## 6. Google Drive permissions

### Конфигурация

| ENV | Назначение |
|-----|------------|
| `GOOGLE_DRIVE_KB_FOLDER_ID` | Knowledge Base root |
| `GOOGLE_DRIVE_EMIGRANT_FOLDER_ID` | Папка «ЭМИГРАНТ» для AI |

### Service account scopes

```35:39:src/lib/google-sheets/auth.ts
    scope: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
    ].join(" "),
```

Drive: **read-only** на уровне OAuth scope. Доступ к папкам — через sharing папок на `GOOGLE_SERVICE_ACCOUNT_EMAIL`.

### Использование

| Поверхность | Модуль | Ограничения |
|-------------|--------|-------------|
| KB UI | `kb-drive.ts` → `GET /api/knowledge-base` | ⚠️ любой `folderId` query param |
| AI context | `kb-text.ts` | Только configured folder IDs, depth/file limits |
| Emigrant docs | `kb-text.ts` | `GOOGLE_DRIVE_EMIGRANT_FOLDER_ID` |

### Оценка: **HIGH** (F-08)

`listKnowledgeBaseFolder(folderId)` не проверяет, что `folderId` — потомок `GOOGLE_DRIVE_KB_FOLDER_ID`. Любой авторизованный пользователь может передать ID любой папки, расшаренной на service account (включая Emigrant).

### Рекомендации

1. Whitelist: разрешать только root или descendants (BFS от KB root, cache tree).
2. Убрать `folderId` из query или валидировать against allowed set.
3. Отдельные SA для KB vs Emigrant с минимальными folder shares.

---

## 7. Google Sheets permissions

### Режимы чтения CRM

| Режим | Условие | Аутентификация |
|-------|---------|----------------|
| Service account API | `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` | JWT → OAuth token |
| **Публичный CSV** | `GOOGLE_SHEETS_SPREADSHEET_ID` + `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID` | **Нет** — URL export |

```87:93:src/lib/google-sheets/google-sheets-client.ts
  private async fetchPublicClientsCsv(): Promise<string[][]> {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
```

Если таблица опубликована («Anyone with the link» / «Publish to web»), **полный CRM CSV доступен вне платформы** любому, кто знает `spreadsheetId` и `gid`.

Formgrid использует тот же паттерн в `formgrid-leads.ts`.

### Запись в Sheets

`google-sheets-client.ts`: `appendRow`, `updateCell`, `appendNote`, `appendExternalClientRow` — через scope `spreadsheets` (read **и** write).

Триггер CRM write: `create_in_crm` в `lead-review-service.ts`, gated:

- `CRM_WRITE_ENABLED` (default `false`)
- `CRM_WRITE_DRY_RUN` (default `true`)

### Оценка

| ID | Находка | Severity |
|----|---------|----------|
| F-01 | Публичный CSV path | **CRITICAL** |
| F-07 | Full spreadsheets write scope | **HIGH** |
| F-02 | TLS disabled on Google fetch | **HIGH** |
| F-22 | Write flags default safe | **LOW** mitigation |

### Рекомендации

1. **Production:** отключить `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID`; только service account + private sheet.
2. Сузить scope до `spreadsheets.readonly` где write не нужен; отдельный SA для write с минимальным sheet access.
3. Убрать `rejectUnauthorized: false` в production (`google-fetch.ts`, `google-sheets-client.ts`, `formgrid-leads.ts`).
4. Аудит Google Cloud: кто имеет доступ к SA key, IAM, sheet sharing.

---

## 8. Debug endpoints

### HTTP

| Endpoint | Method | Auth | Role | Данные |
|----------|--------|------|------|--------|
| `/api/ai-workspace/clients-diagnostic` | GET | session | ❌ | Counts, search columns, **3 samples с паспортами**, recent searches |
| `/api/ai-workspace/sheets-health` | GET | session | ❌ | Counts, source labels |

UI: кнопка «🔍 Диагностика клиентов» в `AiWorkspaceView.tsx` — доступна **всем** авторизованным.

### Chat command

| Команда | Где | Auth | Данные |
|---------|-----|------|--------|
| `/debug_client [query]` | AI Workspace (`client-lookup.ts`, `workspace-assistant.ts`) | session (via API) | Raw scan строк, scored candidates, dedup groups |

Phase A: `appPassword` redacted в `formatDebugClientReply`; паспорта и прочие поля — **видны**.

### Оценка

| ID | Severity |
|----|----------|
| F-09 clients-diagnostic | **HIGH** |
| F-10 /debug_client | **HIGH** |
| F-30 sheets-health | **LOW** |

### Рекомендации

1. Owner-only gate на diagnostic endpoints и `/debug_client`.
2. Или отключить в production (`NODE_ENV === "production"` → 404).
3. Убрать passport из samples в diagnostic report.

---

## 9. Service-role ключи

### Места использования

| Клиент | ENV | Файл | Данные |
|--------|-----|------|--------|
| Platform Supabase | `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/server.ts` | tasks, chat, chats, notes, notifications, presence, app_state, storage |
| Emigrant Desk | `EMIGRANT_SUPABASE_SERVICE_ROLE_KEY` | `src/lib/emigrant-desk/server.ts` | `profiles`, `cases` (PII + `internal_comment`) |

Repos (все через `getSupabaseAdmin()`):

- `tasks-repo.ts`, `team-chat-repo.ts`, `workspace-chats-repo.ts`
- `client-notes-repo.ts`, `notifications-repo.ts`, `presence-repo.ts`, `app-state.ts`
- `attachment-storage.ts`, `team-chat/*-storage.ts`

### Защита

- `import "server-only"` на server modules ✅
- Ключ не в `NEXT_PUBLIC_*` ✅
- Singleton client — ключ в memory process ✅

### Оценка: **HIGH** (F-04, F-11)

Два service role удваивают поверхность атаки. Emigrant Desk тянет `internal_comment` в AI context без redaction.

### Рекомендации

1. RLS + deny-by-default even with service role bypass documented.
2. Emigrant: read-only DB user с `SELECT` только на нужные columns.
3. Secret scanning в CI; rotate keys quarterly.
4. Redact `internal_comment` перед OpenRouter (см. F-13).

---

## 10. AUTH_PASSWORD

### Места использования

| Место | Назначение |
|-------|------------|
| `src/lib/auth/users.ts` | `getStoredPassword()` → `verifyUserPassword()` |
| `.env.example` | Документация 4 ключей |
| `scripts/hash-password.mjs` | Локальная генерация bcrypt |
| `src/components/auth/DemoCredentials.tsx` | Dev UI с plain passwords |
| `src/app/login/page.tsx` | `DemoCredentials` только non-production |

### Логика

```47:56:src/lib/auth/users.ts
function getStoredPassword(user: TeamUser): string | undefined {
  const fromEnv = process.env[user.passwordEnvKey]?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    return undefined;  // login impossible without ENV
  }
  return DEV_DEFAULT_PASSWORDS[user.id];
}
```

```74:78:src/lib/auth/users.ts
  if (stored.startsWith("$2a$") || stored.startsWith("$2b$")) {
    return bcrypt.compare(password, stored);
  }
  return password === stored;  // plain text compare
```

### Ключи ENV

- `AUTH_PASSWORD_VERONIKA`
- `AUTH_PASSWORD_MANAGER_1`
- `AUTH_PASSWORD_MANAGER_2`
- `AUTH_PASSWORD_MANAGER_3`

### Оценка

| ID | Severity |
|----|----------|
| F-12 plain text in prod allowed | **HIGH** |
| F-23 demo credentials in dev | **LOW** |
| F-24 dev password fallbacks | **LOW** |

### Рекомендации

1. Production policy: **только bcrypt**; отклонять plain-text (detect lack of `$2` prefix).
2. Минимальная длина пароля при hash.
3. Убрать hardcoded emails из `users.ts` → config/ENV (опционально).
4. 2FA для owner account (roadmap).

---

## Дополнительные области

### Локальное хранилище (`.data/`)

Множество stores (`tasks`, `team-chat`, `notifications`, `workspace-chats`) fallback на filesystem при отсутствии Supabase. На Vercel ephemeral FS — не production path. Риск только при self-hosted без Supabase.

**Severity: LOW** (deployment-dependent)

### Team chat / file download

`GET /api/team-chat/file/[id]` — любой auth user может скачать любой файл чата по ID (общий team chat by design).

**Severity: LOW** (expected for internal team tool)

### OpenRouter / AI data leakage

После Phase A `appPassword` защищён. Остаются Internal поля в prompt (`notes`, `internalComment`). См. `AI_DATA_CLASSIFICATION.md`.

**Severity: MEDIUM** (F-13)

---

## Матрица severity (сводка)

| Severity | Количество | Примеры |
|----------|------------|---------|
| **CRITICAL** | 1 | F-01 публичный CSV CRM |
| **HIGH** | 11 | F-02–F-12 (RLS, TLS, RBAC, debug, SA keys, passwords) |
| **MEDIUM** | 9 | F-13–F-21 |
| **LOW** | 9 | F-22–F-30 (mitigations + positives) |

---

## Roadmap remediation (приоритет)

### P0 — немедленно (до / в production)

1. **Отключить публичный CSV** для CRM в prod (`GOOGLE_SHEETS_PUBLIC_CLIENTS_GID` пустой).
2. **Проверить Google Sheet sharing** — не «Anyone with the link» для CRM/Formgrid.
3. **`AUTH_SECRET` + bcrypt `AUTH_PASSWORD_*`** на Vercel production.
4. **Убрать `rejectUnauthorized: false`** в production builds.

### P1 — 1–2 спринта

5. Owner-only на `clients-diagnostic`, `/debug_client`, `create_in_crm`.
6. Валидация `folderId` в Knowledge Base API.
7. Rate limit login + AI endpoints.
8. RLS enable + deny policies на все таблицы.

### P2 — hardening

9. Сузить Google SA scopes; split read/write accounts.
10. Middleware wrapper или central auth для `/api/*`.
11. Redact `internalComment` / notes перед OpenRouter.
12. Убрать реальные IDs/emails из `.env.example` и `users.ts`.

---

## Методология

- Статический анализ: `grep`, чтение migrations, middleware, auth, API routes, Google/Supabase modules.
- Перекрёстная проверка с `AI_DATA_CLASSIFICATION.md` и `SECURITY_PHASE_A_REPORT.md`.
- Runtime penetration testing **не проводился**.
- Проверка реальных Vercel ENV и Google Cloud IAM **не проводилась** — требует доступа владельца.

---

## Итоговая оценка

| Уровень | Вердикт |
|---------|---------|
| **CRITICAL** | 1 активный класс риска (публичный CSV при misconfiguration) |
| **HIGH** | Доминирующий уровень — отсутствие RLS/RBAC, TLS, debug surfaces |
| **Общий risk posture** | **HIGH** для production с реальными CRM-данными |
| **Приемлемо для** | Закрытая команда ≤4 человек, private Google assets, bcrypt passwords, CRM write disabled, Phase A active |

Платформа **не готова** к расширению команды или exposure в интернет без выполнения P0–P1 roadmap.
