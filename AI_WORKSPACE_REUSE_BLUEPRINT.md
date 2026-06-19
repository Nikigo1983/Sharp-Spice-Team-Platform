# AI Workspace Reuse Blueprint

## 0) Scope

Цель документа: извлечь текущую архитектуру AI Workspace из `Sharp & Spice Team Platform` и описать переносимую схему для нового корпоративного приложения.

Ограничения:
- без изменений существующего продукта в рамках blueprint;
- без создания нового AI прямо сейчас;
- только аудит и план повторного использования.

---

## 1) Карта текущих файлов AI Workspace

### AI Provider / Runtime
- `src/lib/ai/config.ts` — выбор провайдера (`openrouter` / `openai`) и базовой модели.
- `src/lib/ai/openai.ts` — единый клиент для chat completion и stream, сбор payload, retry/error.
- `src/lib/ai/workspace-config.ts` — параметры AI Workspace (`model`, `temperature`, `maxTokens`, `stream`, `mode`).

### Prompt Layer
- `src/lib/ai/workspace-prompt.ts` — базовый system prompt и режимы ответа.
- `src/lib/ai/workspace-assistant.ts` — финальная сборка `system + history + context + user question`.

### Context & Sources
- `src/lib/ai/workspace-context.ts` — оркестратор контекста.
- `src/lib/ai/query-intent.ts` — routing intent (какие источники подключать).
- `src/lib/ai/client-search-intent.ts` — структурированный intent для client search.
- `src/lib/ai/client-lookup.ts` — поиск клиента (single/multiple/fuzzy/structured).
- `src/lib/ai/structured-client-search.ts` — фильтры и scoring по колонкам.
- `src/lib/ai/client-context.ts` — нормализованный client context.
- `src/lib/ai/client-field-sources.ts` — атрибуция полей по источникам.
- `src/lib/ai/format-client.ts` — формат контекста клиента для AI.
- `src/lib/google-sheets/*` — CRM/Formgrid adapters.
- `src/lib/google-drive/kb-text.ts` — Knowledge Base / Drive context.
- `src/lib/emigrant-desk/clients.ts` — Emigrant Desk context.

### API Layer
- `src/app/api/ai-workspace/route.ts` — основной endpoint AI Workspace (sync + stream SSE).
- `src/app/api/ai-workspace/chats/route.ts` — список/создание чатов.
- `src/app/api/ai-workspace/chats/[id]/route.ts` — get/update/delete чата.
- `src/app/api/ai-workspace/clients-diagnostic/route.ts` — диагностика источников.
- `src/app/api/ai-workspace/sheets-health/route.ts` — health проверки источников.

### UI Layer
- `src/components/ai-workspace/AiWorkspaceView.tsx` — главный экран чата, режимы, stream consumer, history.
- `src/components/ai-workspace/AssistantMessageMarkdown.tsx` — markdown rendering.
- `src/app/(app)/ai-workspace/page.tsx` — страница раздела.

### Chat History / Persistence
- `src/lib/ai/workspace-chats.ts` — репозиторий истории (Supabase + fallback file).
- `src/lib/ai/workspace-chat-types.ts` — типы истории чатов.
- `src/lib/supabase/workspace-chats-repo.ts` — Supabase implementation.

---

## 2) Схема текущей архитектуры

1. UI (`AiWorkspaceView`) отправляет `message + history + mode`.
2. API (`/api/ai-workspace`) валидирует session.
3. `workspace-assistant.ts`:
   - определяет intent;
   - ищет клиента (при необходимости);
   - собирает контекст из sources;
   - строит final prompt;
   - вызывает LLM через `openai.ts`.
4. Ответ:
   - sync JSON или SSE stream (`status`, `meta`, `delta`, `done`).
5. UI рендерит markdown, пишет историю в chat API.

---

## 3) Что можно переиспользовать почти без изменений

- OpenRouter/OpenAI transport:
  - `src/lib/ai/openai.ts`
  - stream parser, retry logic, headers.
- Streaming protocol (SSE):
  - API event model в `src/app/api/ai-workspace/route.ts`;
  - UI consumer в `AiWorkspaceView`.
- Chat UI primitives:
  - message list, composer, history rail, streaming states.
- Markdown rendering:
  - `AssistantMessageMarkdown.tsx`.
- Chat history abstraction:
  - `workspace-chats.ts` + Supabase repo + fallback.
- Базовая обработка ошибок:
  - graceful fallback в API/UI.

---

## 4) Что нужно заменить для нового приложения

- System prompt и mode-инструкции (`workspace-prompt.ts`).
- Источники данных и adapters (новые Google Sheets / другие backend источники).
- Intent rules (keyword + routing логика).
- Client/entity search (колонки, scoring, disambiguation).
- Role model и permissions для admin/client.
- Навигационные ссылки и source labels в UI.

---

## 5) AI Provider / Model Layer (детали)

### Где что находится
- Provider selection: `src/lib/ai/config.ts`.
- Model/runtime params: `src/lib/ai/workspace-config.ts`.
- Payload + transport + errors: `src/lib/ai/openai.ts`.

### Как выбирается модель
- Приоритет:
  1. `AI_WORKSPACE_MODEL` (для workspace);
  2. иначе модель из runtime (`OPENROUTER_MODEL`/`OPENAI_MODEL`);
  3. fallback дефолт в config.

### Параметры inference
- `AI_WORKSPACE_TEMPERATURE`
- `AI_WORKSPACE_MAX_TOKENS`
- `AI_WORKSPACE_STREAM`

### Ошибки
- Sync: retry (429 + backoff), затем controlled failure.
- Stream: SSE parsing, обработка `event:error`, graceful close.

---

## 6) Prompt Layer (детали)

### Где хранится prompt
- `src/lib/ai/workspace-prompt.ts`
  - базовый prompt;
  - mode-specific инструкции.

### Как формируется финальный prompt
- `workspace-assistant.ts`:
  - `buildContextBlock(...)`
  - `buildChatMessages(...)`
  - добавляется ограниченный history (`последние 4` реплики).

### Что переиспользовать
- Структуру prompt builder: `base + mode + context policy`.

### Что заменить
- Tone of voice.
- Доменные правила и ограничения.
- Секции и приоритеты источников для нового продукта.

---

## 7) Context Layer (детали)

### Текущие источники
- CRM clients (Google Sheets external clients table).
- Formgrid leads table.
- Google Drive KB.
- Google Drive Emigrant docs.
- Emigrant Desk statuses.
- Chat history (частично, последние turns).

### Ключевые функции
- `buildWorkspaceContext(...)` — `src/lib/ai/workspace-context.ts`.
- `buildClientsContextForAi(...)`.
- `getKnowledgeBaseTextForAi(...)`.
- `getEmigrantDriveTextForAi(...)`.
- `buildFormgridContextForAi(...)`.
- `buildEmigrantDeskContextForAi(...)`.

### Формируемые блоки
- `CLIENT CONTEXT`
- `CLIENT CANDIDATES`
- `KNOWLEDGE BASE`
- `ЭМИГРАНТ (документы)`
- `КЛИЕНТЫ`
- `FORMGRID`

---

## 8) Intent Detection (детали)

### Сейчас
- `src/lib/ai/query-intent.ts` — source routing.
- `src/lib/ai/client-search-intent.ts` — structured client intent.

### Hardcoded части
- keyword-based включение источников;
- специальные эвристики для passport/document;
- правила для desk/drive/client modes.

### Для нового приложения заменить
- все keyword rules;
- mapping intent -> data sources;
- entity extraction правила;
- fallback/disambiguation сценарии.

---

## 9) UI Layer (детали)

### Основные компоненты
- `AiWorkspaceView.tsx`
- `AssistantMessageMarkdown.tsx`

### Где что
- Chat + history + modes + stream: `AiWorkspaceView`.
- Markdown output: `AssistantMessageMarkdown`.
- Режимы ответа: `RESPONSE_MODES` в `AiWorkspaceView`.

### Что можно копировать
- streaming UX;
- history sidebar;
- markdown renderer;
- mode switch UX (как паттерн).

### Что заменить
- preset buttons;
- labels/sources;
- role-specific surface;
- доменные карточки и быстрые действия.

---

## 10) API Layer (детали)

### Основной route
- `POST /api/ai-workspace` (`src/app/api/ai-workspace/route.ts`)

### Request
- `message`
- `history`
- `mode`
- `pendingClientCandidates` (для disambiguation flow)

### Response
- Sync JSON: `reply`, `sources`, `demo`, ...
- Stream SSE:
  - `status`
  - `meta`
  - `delta`
  - `done`
  - `error`

### Auth
- `getSession()` check на сервере.

---

## 11) Chat History

### Где хранится
- `workspace-chats.ts`:
  - Supabase, если configured;
  - file fallback `.data/ai-workspace-chats/*.json`.

### Для нового приложения
- оставить abstraction;
- для production рекомендован Supabase only;
- fallback использовать только локально/dev.

---

## 12) Reusable Data Adapter Pattern

Рекомендуемая целевая структура:

1. **AI Core**
   - orchestration, safety gates, stream/sync.
2. **Prompt Builder**
   - base prompt + mode prompt + role prompt + source policy.
3. **Context Builder**
   - собирает только разрешенные source blocks.
4. **Source Adapters**
   - Google Sheets / DB / Drive / CRM / custom APIs.
5. **Role Modes**
   - Admin AI
   - Client AI
6. **Output Guard**
   - redaction/allowlist post-processing.

---

## 13) Admin AI vs Client AI Design

## Admin AI
- видит внутренние таблицы/статусы/операционные поля;
- может анализировать клиентов, документы, процессы;
- использует internal tone;
- допускает технические детали и источники.

## Client AI
- видит только allowlist полей;
- не видит внутренние комментарии/таблицы целиком;
- не раскрывает системные метки/ID/внутренние статусы;
- friendly plain-language ответы;
- отдельный prompt + строгие ограничения.

## Что переиспользуется
- transport, stream, chat UI, history.

## Что разделяется отдельно
- prompt,
- context adapters,
- intent rules,
- permissions and redaction.

---

## 14) ENV Checklist для нового приложения

### Обязательные
- `AUTH_SECRET`
- `OPENROUTER_API_KEY` **или** `OPENAI_API_KEY`
- `AI_WORKSPACE_MODEL`
- `AI_WORKSPACE_TEMPERATURE`
- `AI_WORKSPACE_MAX_TOKENS`
- `AI_WORKSPACE_STREAM`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Опциональные (в зависимости от провайдера)
- `OPENROUTER_MODEL`
- `OPENROUTER_HTTP_REFERER`
- `OPENROUTER_APP_TITLE`
- `OPENAI_MODEL`

### Зависящие от источников данных
- Google Sheets:
  - `GOOGLE_SHEETS_SPREADSHEET_ID`
  - `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID`
  - `GOOGLE_SHEETS_FORMGRID_SPREADSHEET_ID`
  - `GOOGLE_SHEETS_FORMGRID_GID`
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_PRIVATE_KEY`
- Google Drive:
  - `GOOGLE_DRIVE_KB_FOLDER_ID`
  - `GOOGLE_DRIVE_EMIGRANT_FOLDER_ID`
- Cache/perf:
  - `GOOGLE_SHEETS_CACHE_TTL_MS`

---

## 15) Migration Blueprint

### Phase 1 — AI Core
- вынести provider/runtime/stream/error в независимый модуль;
- зафиксировать единый response contract (sync + SSE).

### Phase 2 — UI Chat
- перенести базовый chat shell + markdown renderer + stream consumer.

### Phase 3 — Admin Prompt
- написать admin system prompt + mode instructions;
- включить internal policy + data attribution.

### Phase 4 — Data Adapters
- подключить новые источники (Sheets/DB/Drive/API) через adapter interface.

### Phase 5 — Client AI
- отдельный prompt, отдельный context builder с allowlist;
- отключить внутренние источники и поля.

### Phase 6 — Roles / Permissions
- server-side role gates;
- route + adapter + output guard checks.

### Phase 7 — Testing
- intent tests;
- prompt safety tests;
- role leakage tests;
- stream robustness tests.

### Phase 8 — Production ENV
- заполнить env checklist;
- smoke + monitoring;
- staged rollout (admins -> pilot clients -> full).

---

## 16) Risks / Important Notes

### Что нельзя копировать без адаптации
- текущие prompt тексты;
- hardcoded intent keywords;
- доменные источники и эвристики.

### Ключевые риски
- утечки internal data в Client AI;
- role bypass, если доверять клиентскому `mode`;
- over-broad context injection;
- prompt override через user content.

### Как снизить риски
- roleMode определять только на сервере;
- field-level allowlist per role;
- adapter-level access checks;
- output redaction before return;
- audit logs по source access.

### Prompt safety testing
- adversarial prompts (exfiltration attempts);
- red-team сценарии на role crossing;
- regression тесты на запрещённые поля;
- snapshot tests финальных prompt/context blocks.

---

## 17) Быстрый путь запуска AI в новом приложении (рекомендация)

1. Скопировать AI transport + SSE protocol + chat UI/history.
2. Сразу разделить `Admin AI` и `Client AI` на уровне серверного роутинга.
3. Подключить только 1-2 источника данных на старте (MVP adapters).
4. Запустить с простыми mode prompts (`brief`, `client-text`) и строгой allowlist.
5. Добавлять intent complexity и новые adapters поэтапно после safety regression.

---

## Appendix: Reuse Matrix (коротко)

### Reuse as-is
- `src/lib/ai/openai.ts`
- `src/app/api/ai-workspace/route.ts` (SSE contract pattern)
- `src/components/ai-workspace/AssistantMessageMarkdown.tsx`
- `src/lib/ai/workspace-chats.ts` + supabase repo

### Replace / App-specific
- `src/lib/ai/workspace-prompt.ts`
- `src/lib/ai/query-intent.ts`
- `src/lib/ai/client-search-intent.ts`
- `src/lib/ai/workspace-context.ts` source composition
- domain adapters in `src/lib/google-sheets/*`, `src/lib/google-drive/*`, `src/lib/emigrant-desk/*`

