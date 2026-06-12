# AI Workspace — аудит потока данных и повторных чтений Google Sheets

**Дата:** 2026-06-09  
**Статус:** только диагностика, код не менялся  
**Цель:** зафиксировать дублирование чтений перед внедрением Unified Client Index (UCI)

---

## Краткий вывод

Один запрос AI Workspace **неизбежно проходит два независимых контура загрузки данных**:

1. **Client search** (`lookupClientsWithAiSearch`) — ищет клиента в CRM + Formgrid.
2. **Workspace context** (`buildWorkspaceContext`) — собирает фоновые блоки для Claude **независимо** от результата поиска.

Между этапами **нет передачи уже загруженных таблиц**. Повторные вызовы `listAllClients()` / `listClients()` / `getFormgridLeadsTable()` смягчаются **in-memory кэшем** (TTL по умолчанию 10 с, `GOOGLE_SHEETS_CACHE_TTL_MS`), но логически данные читаются и обрабатываются несколько раз.

---

## ЧАСТЬ 1. Трассировка запроса

**Запрос:** `Покажи информацию по клиенту Белоусова`

**Точка входа:** `POST /api/ai-workspace` → `runWorkspaceAi` / `runWorkspaceAiStream` → `prepareWorkspaceRequest()`

### Распознанный intent (`detectWorkspaceIntent`)

| Флаг | Значение | Причина |
|------|----------|---------|
| `needsClients` | **true** | есть слово «клиент» |
| `needsEmigrantDesk` | **true** | `needsEmigrantDesk \|\| needsClients` в `query-intent.ts` |
| `needsFormgrid` | false | нет «анкет» / «formgrid» |
| `needsKb` | false | нет KB-триггеров |
| `needsEmigrantDrive` | false | нет «эмигрант» / «документ» / «pdf» |
| `fastClientLookup` | false | нет «букинг» / «адрес» / «статус» |

### Полный путь выполнения

| Шаг | Файл | Функция | Какие данные читаются |
|-----|------|---------|----------------------|
| 1 | `src/app/api/ai-workspace/route.ts` | `POST` | Тело запроса, сессия (без Sheets) |
| 2 | `src/lib/ai/workspace-assistant.ts` | `prepareWorkspaceRequest` | Оркестрация |
| 3 | `src/lib/ai/client-lookup.ts` | `lookupClientsWithAiSearch` | Запуск client search |
| 4 | `src/lib/ai/client-search-intent.ts` | `analyzeClientSearchIntent` | **LLM** (OpenRouter) — JSON intent, **без Sheets** |
| 5 | `src/lib/ai/client-search-intent.ts` | `parseClientSearchIntentRules` | Правила: `clientName` ≈ «Белоусова» через `extractClientEntityFromQuery` |
| 6 | `src/lib/ai/structured-client-search.ts` | `executeStructuredClientSearch` | **`listAllClients()` → CRM (Google Sheets CSV)** |
| 7 | `src/lib/ai/structured-client-search.ts` | `executeStructuredClientSearch` | **`getFormgridLeadsTable()` → Formgrid CSV** |
| 8 | `src/lib/ai/client-context.ts` | `crmClientToContext` / `formgridRowToContext` | В память: `ClientContext` для совпадений (без нового fetch) |
| 9a | `src/lib/ai/client-lookup.ts` | `lookupClientsInSheets` → `collectClientMatches` | **Повтор CRM + Formgrid** — только если structured search вернул 0 (fallback) |
| 9b | `src/lib/ai/workspace-assistant.ts` | `lookupFuzzyClientCandidates` | **Повтор CRM + Formgrid** — только если `not_found` |
| 10 | `src/lib/ai/workspace-assistant.ts` | `tryDirectBookingAnswer` | Пропуск (нет «букинг»/«адрес») |
| 11 | `src/lib/ai/workspace-assistant.ts` | `tryDirectEmigrantStatusAnswer` | Пропуск (нет «статус» в запросе) |
| 12 | `src/lib/ai/workspace-assistant.ts` | `tryDirectFormgridRecentAnswer` | Пропуск (`needsFormgrid` = false) |
| 13 | `src/lib/ai/workspace-context.ts` | `buildWorkspaceContext` | Параллельная загрузка фоновых блоков |
| 14 | `src/lib/ai/workspace-context.ts` | `buildClientsContextForAi` | **`listClients(1, 300)` → тот же `getClients()` / CRM** |
| 15 | `src/lib/emigrant-desk/clients.ts` | `buildEmigrantDeskContextForAi` | **Supabase** `profiles` + `cases` (Emigrant Desk) |
| 16 | `src/lib/ai/workspace-assistant.ts` | `buildContextBlock` | Сборка промпта для Claude |
| 17 | `src/lib/ai/workspace-assistant.ts` | `buildContextBlock` | Блок `=== CLIENT CONTEXT ===` из шага 8 (**из памяти**) |
| 18 | `src/lib/ai/workspace-assistant.ts` | `buildContextBlock` | Блок `=== КЛИЕНТЫ ===` **не добавляется** (есть `clientContext`) |
| 19 | `src/lib/ai/workspace-assistant.ts` | `buildContextBlock` | Блок `=== EMIGRANT CROATIA DESK ===` **добавляется** |
| 20 | `src/lib/ai/openai.ts` | `createChatCompletion` / `streamChatCompletion` | **LLM** — финальный ответ |

### Типичный happy-path для «Белоусова»

```
API → prepareWorkspaceRequest
  → lookupClientsWithAiSearch
      → analyzeClientSearchIntent (LLM #1)
      → executeStructuredClientSearch
          → listAllClients()        [CRM]
          → getFormgridLeadsTable() [Formgrid]
      → clientContext = single match (Белоус)
  → buildWorkspaceContext
      → buildClientsContextForAi    [CRM снова, результат не в промпт]
      → buildEmigrantDeskContextForAi [Supabase]
  → buildContextBlock (CLIENT CONTEXT + EMIGRANT DESK)
  → createChatCompletion (LLM #2)
```

---

## ЧАСТЬ 2. Подсчёт чтений на один запрос

### Запрос: «Покажи информацию по клиенту Белоусова» (happy path)

| Источник | Логических вызовов загрузки | Сетевых обращений (холодный кэш) | Сетевых обращений (тёплый кэш, тот же запрос) |
|----------|----------------------------|----------------------------------|-----------------------------------------------|
| **CRM (Google Sheets)** | **2** | **1** (CSV export) | **0** (2-й вызов из memory cache) |
| **Formgrid** | **1** | **1** (CSV export) | **0** |
| **Knowledge Base** | 0 | 0 | 0 |
| **ЭМИГРАНТ (Drive)** | 0 | 0 | 0 |
| **Emigrant Desk (Supabase)** | **1** (`listEmigrantDeskClients`) | **2** (profiles + cases) | **2** (нет общего кэша с Sheets) |

Дополнительно (не Sheets): **2 вызова LLM** — intent extraction + ответ workspace.

### Повторные чтения (явные)

| Пара | Где | Характер |
|------|-----|----------|
| CRM #1 → CRM #2 | `executeStructuredClientSearch` → `buildClientsContextForAi` | **Повторный вызов** `getClients()`. При тёплом кэше — без HTTP, но **повторная итерация/ранжирование до 300 клиентов** |
| Formgrid (только search) | Для этого запроса Formgrid **не** читается в `buildWorkspaceContext` (`needsFormgrid` = false) | Не дублируется |
| Emigrant Desk | Загружается **всегда** при `needsClients`, даже если клиент уже найден в Sheets | Избыточно для чисто CRM-запросов |

### Повторные читания (условные / худший сценарий)

| Сценарий | CRM | Formgrid |
|----------|-----|----------|
| Structured search → 0 → `lookupClientsInSheets` | **3** логических вызова | **2** |
| `not_found` → `lookupFuzzyClientCandidates` | **+1** (ещё `collectClientMatches`) | **+1** |
| `fastClientLookup` → `tryDirectBookingAnswer` | **+1** `listClients(1, 300)` | — |
| `needsFormgrid` + direct answer | — | **2** (`tryDirectFormgridRecentAnswer` + `buildFormgridContextForAi`) |

### Справка: слой кэша

- Файл: `src/lib/google-sheets/cache.ts`
- Ключи: `clients:parsed`, `formgrid-leads:table`
- TTL: `GOOGLE_SHEETS_CACHE_TTL_MS` (default **10 000 ms**)
- Кэш **процессный** (не shared между инстансами Vercel, сбрасывается при cold start)

---

## ЧАСТЬ 3. Передача данных между этапами

### Что уже есть в памяти после client search

После успешного `lookupClientsWithAiSearch` в `prepareWorkspaceRequest` доступны:

- `clientContext: ResolvedClientContext` — имя, статус, менеджер, заметки, score, `debugRow`
- `aiSearch.intent` — распознанные фильтры
- `clientSearchIntentNote` — текст для промпта

Эти объекты **передаются в `buildContextBlock`** и попадают в Claude как `=== CLIENT CONTEXT ===`.

### Что читается повторно (и зачем)

| Данные | Уже в памяти? | Повторное чтение | Используется в промпте? |
|--------|---------------|------------------|-------------------------|
| Найденный клиент CRM | **Да** (`clientContext`) | Нет (для промпта) | **Да** |
| Вся таблица CRM | Частично (объекты из search) | **Да** — `buildClientsContextForAi` | **Нет** при наличии `clientContext` |
| Formgrid | Только если match в search | Нет для этого запроса | **Нет** |
| Emigrant Desk | Нет | **Да** — всегда при `needsClients` | **Да** — весь блок в промпт |

### Ключевая проблема архитектуры

```typescript
// workspace-assistant.ts — порядок фиксирован:
const aiSearch = await lookupClientsWithAiSearch(trimmed);  // загрузка #1
// ... clientContext формируется ...
context = await buildWorkspaceContext(trimmed, intent);     // загрузка #2 (независимо)
```

`buildWorkspaceContext` **не принимает** результат search и **не знает**, что клиент уже найден. Условие «не показывать `clientsText`» есть только в `buildContextBlock` (уровень промпта), но **не отменяет** загрузку в шаге 14.

Аналогично для Formgrid: при `needsFormgrid && clientContext` блок `FORMGRID` не попадает в промпт (`buildContextBlock`, строка 151), но `buildFormgridContextForAi` **всё равно вызывается** внутри `buildWorkspaceContext`.

---

## ЧАСТЬ 4. План оптимизации (без UCI)

### Принцип: Request-scoped Data Bundle

Ввести объект уровня одного HTTP-запроса (без новой БД):

```typescript
type WorkspaceDataBundle = {
  crmClients: Client[] | null;
  formgrid: LeadsTableResult | null;
  loadedAt: number;
};
```

Загружать один раз, передавать по цепочке.

### Этап 1 — быстрые победы (низкий риск)

| # | Изменение | Эффект |
|---|-----------|--------|
| 1 | В `prepareWorkspaceRequest`: если `clientContext` или `clientCandidates` — **пропускать** `buildClientsContextForAi` | −1 логическое чтение CRM, −ранжирование 300 строк |
| 2 | В `buildWorkspaceContext`: если `clientContext` и `!needsFormgrid` — **пропускать** `buildFormgridContextForAi` | −1 чтение Formgrid на смешанных запросах |
| 3 | Сузить `needsEmigrantDesk`: не включать автоматически при любом `needsClients` | −Supabase на чистых CRM-вопросах |
| 4 | При structured → fallback: передавать уже загруженные `crmClients` / `formgrid` в `lookupClientsInSheets` | −1 полный проход по таблицам |

### Этап 2 — request-scoped loader

```
prepareWorkspaceRequest(query, intent)
  ↓
loadWorkspaceSheetsOnce()  // Promise<WorkspaceDataBundle>
  ↓
lookupClientsWithAiSearch(query, bundle)
  ↓
buildWorkspaceContext(query, intent, bundle, { skipClients: !!clientContext })
  ↓
Claude
```

Реализация: `AsyncLocalStorage` или явный параметр `bundle` через 3–4 функции.

### Этап 3 — устранение двойного LLM для intent

`analyzeClientSearchIntent` вызывает отдельный LLM-запрос. Для запросов с явным ФИО (`extractClientEntityFromQuery`) можно использовать **только rules** без AI intent — экономия latency и токенов (не про Sheets, но про скорость ответа).

### Этап 4 — observability

Добавить счётчики (лог / метрики):

- `sheets_fetch_crm` / `sheets_fetch_formgrid` (cache hit/miss)
- `workspace_context_skipped`
- `duplicate_read_prevented`

### Ожидаемый результат для «Белоусова»

| Метрика | Сейчас | После этапа 1–2 |
|---------|--------|------------------|
| Логических чтений CRM | 2 | **1** |
| Логических чтений Formgrid | 1 | **1** (нужен для dedup/search) |
| CRM в промпте Claude | 1 блок (CLIENT CONTEXT) | без изменений |
| Лишняя работа CPU | ранжирование 300 CRM | **0** |

---

## ЧАСТЬ 5. Готовность к Unified Client Index

### После устранения повторных чтений можно ли переходить к UCI?

**Да** — устранение дублирования является **рекомендуемым подготовительным этапом**, а не альтернативой UCI.

Повторные чтения — операционный долг (latency, нагрузка на Google). UCI решает **другую** задачу: единая модель клиента, склейка CRM + Formgrid + Desk, стабильный identity.

### Блокеры, которые останутся даже после dedup

| Блокер | Описание |
|--------|----------|
| **Два источника Sheets** | CRM (External) и Formgrid — разные таблицы, разная схема, dedup в runtime |
| **Emigrant Desk** | Отдельная Supabase-БД, не в Sheets |
| **ЭМИГРАНТ / KB** | Google Drive, полнотекстовый поиск — вне scope Sheets |
| **Нет стабильного client_id** | CRM: passport / ROW-N; Formgrid: row index; Desk: user_id |
| **Кэш 10 с / per-process** | На Vercel инстансы не делят кэш; UCI потребует общий store (Redis / Supabase / SQLite) |
| **Write-path** | Сейчас read-only из Sheets; UCI подразумевает стратегию синхронизации и инвалидации |
| **Два LLM-вызова** | Intent model + workspace model — не блокер UCI, но влияет на SLA |

### Рекомендуемая последовательность

```
1. Request-scoped dedup (этапы 1–2)     ← сейчас
2. Метрики и замеры latency             ← 1–2 дня
3. Проектирование UCI (schema + sync)   ← параллельно
4. UCI как read-model за Sheets         ← следующий этап
5. Постепенная миграция search/context  ← на UCI
```

---

## Приложение A. Карта файлов и ответственности

| Файл | Роль |
|------|------|
| `src/lib/ai/workspace-assistant.ts` | Оркестратор: search → context → LLM |
| `src/lib/ai/client-lookup.ts` | `lookupClientsWithAiSearch`, `collectClientMatches` |
| `src/lib/ai/structured-client-search.ts` | Структурированный поиск по intent |
| `src/lib/ai/workspace-context.ts` | `buildWorkspaceContext`, `buildClientsContextForAi`, `buildFormgridContextForAi` |
| `src/lib/google-sheets/service.ts` | `listAllClients`, `listClients` → `getGoogleSheetsClient().getClients()` |
| `src/lib/google-sheets/formgrid-leads.ts` | `getFormgridLeadsTable` |
| `src/lib/google-sheets/cache.ts` | In-memory TTL cache |
| `src/lib/ai/query-intent.ts` | Флаги `needsClients`, `needsFormgrid`, … |
| `src/lib/emigrant-desk/clients.ts` | Supabase context для Desk |

## Приложение B. Другие типы запросов (сводка)

| Тип запроса | CRM reads (логич.) | Formgrid reads | Примечание |
|-------------|-------------------|----------------|------------|
| ФИО клиента (single) | 2 | 1 | CRM дублируется в context build |
| Список по фильтру | 2 | 1–2 | + Formgrid если `needsFormgrid` |
| Только KB | 0 | 0 | Только Drive |
| Анкеты за N дней | 0–2 | **2** | direct answer + context |
| `/debug_client` | **3+** | **2+** | search + scanRawRows + context |

---

*Документ подготовлен по статическому анализу кодовой базы. Для количественной верификации cache hit/miss рекомендуется добавить временное логирование в `getCached` / `setCached` (отдельная задача).*
