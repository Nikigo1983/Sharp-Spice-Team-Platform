# Security Phase A — отчёт о внедрении

**Дата:** 2026-06-17  
**Scope:** исключение `appPassword` и чувствительных полей из debug surfaces, transport, OpenRouter payload, логов и истории чатов.  
**Не входило в scope:** AI Guardrails, scope classifier, off-topic detection.

---

## Результат

| Требование | Статус | Реализация |
|------------|--------|------------|
| 1. Исключить `appPassword` из debug surfaces | ✅ | `formatDebugClientReply`, `scanRawRowsForTokens`, `buildCrmRawRow` |
| 2. Исключить `appPassword` из `debugRow` | ✅ | Удалено из `buildCrmRawRow`, `redactDebugRow` при merge/collect |
| 3. Исключить из `pendingClientCandidates` transport | ✅ | `sanitizeClientContextsForTransport` в API + workspace-assistant |
| 4. Redaction в логах | ✅ | `redactForLogging` в client-lookup, client-entity-extract, openai |
| 5. OpenRouter payload без `appPassword` | ✅ | `sanitizeChatMessagesForProvider` + `assertOpenRouterPayloadSafe` |
| 6. История чатов без `appPassword` | ✅ | `sanitizeWorkspaceChatTurns` при read/write |

**Тесты:** `npm test` — **62/62 passed**

---

## Изменённые файлы

| Файл | Тип |
|------|-----|
| `src/lib/ai/context-redaction.ts` | **новый** — центральный модуль redaction |
| `src/lib/ai/context-redaction.test.ts` | **новый** — 7 unit-тестов |
| `src/lib/ai/client-lookup.ts` | изменён |
| `src/lib/ai/client-context.ts` | изменён |
| `src/lib/ai/client-deduplication.ts` | изменён |
| `src/lib/ai/client-entity-extract.ts` | изменён |
| `src/lib/ai/openai.ts` | изменён |
| `src/lib/ai/workspace-assistant.ts` | изменён |
| `src/lib/ai/workspace-chats.ts` | изменён |
| `src/app/api/ai-workspace/route.ts` | изменён |
| `package.json` | изменён (добавлен тест) |

**Не изменялись:** UI таблицы клиентов (`ClientsList`, `client-detail-fields`) — `appPassword` остаётся видимым менеджерам в CRM UI по дизайну.

---

## Архитектура решения

```
context-redaction.ts
├── isSensitiveFieldKey()          — ключи: appPassword, password, пароль, token, secret, apiKey
├── redactDebugRow()               — фильтрация Record<string, string>
├── sanitizeClientContextForTransport() — debugRow + surveyData
├── redactSensitiveText()          — строки / JSON в тексте
├── sanitizeChatMessagesForProvider() — перед OpenRouter
├── sanitizeWorkspaceChatTurns()   — перед persist/read чатов
├── redactForLogging()             — объекты в console.log
└── assertOpenRouterPayloadSafe()  — warn если leak после sanitize
```

**Defense in depth:** redaction на нескольких слоях (создание `debugRow` → debug reply → transport → OpenRouter → logs → chat history).

---

## Diff по файлам

### `src/lib/ai/context-redaction.ts` (новый)

Центральный модуль. Ключевые экспорты:

- `SENSITIVE_KEY_PATTERNS` — `appPassword`, `password`, `пароль`, `secret`, `apiKey`, `*token`
- `redactDebugRow()` — удаляет чувствительные ключи из объекта
- `sanitizeClientContextForTransport()` — очищает `debugRow` и `surveyData` перед отправкой клиенту
- `sanitizeChatMessagesForProvider()` — redact в `messages[]` перед `JSON.stringify` в OpenRouter
- `sanitizeWorkspaceChatTurns()` — redact при сохранении/чтении истории
- `redactForLogging()` — рекурсивная redaction для `console.log`
- `containsSensitiveMarkers()` — детектор незамаскированных значений (для тестов и assert)

### `src/lib/ai/client-lookup.ts`

```diff
-    appPassword: client.appPassword ?? "",
+    // appPassword intentionally excluded from debugRow

-      ctx.debugRow = { ...buildCrmRawRow(client), ...ctx.debugRow };
+      ctx.debugRow = redactDebugRow({ ...buildCrmRawRow(client), ...ctx.debugRow });

+      if (isSensitiveFieldKey(column)) continue;   // scanRawRowsForTokens CRM
+      if (!value || isSensitiveFieldKey(header)) return;  // Formgrid scan

-  console.log("[ai-client-search]", { query: payload.query, ... });
+  console.log("[ai-client-search]", redactForLogging({ query: payload.query, ... }));
```

### `src/lib/ai/client-context.ts`

```diff
+    if (header && value && !isSensitiveFieldKey(header)) {  // formgrid debugRow

+      const displayValue = isSensitiveFieldKey(hit.column) ? REDACTED_VALUE : hit.value.slice(0, 120);

-        const rowJson = JSON.stringify(client.debugRow, null, 2);
+        const rowJson = JSON.stringify(redactDebugRow(client.debugRow), null, 2);
```

### `src/lib/ai/client-deduplication.ts`

```diff
-    debugRow: Object.fromEntries(parts.flatMap(...)),
+    debugRow: redactDebugRow(Object.fromEntries(parts.flatMap(...))),
```

### `src/lib/ai/client-entity-extract.ts`

```diff
-  console.log("Запрос:", rawQuery);
+  console.log("Запрос:", redactForLogging(rawQuery));
```

### `src/lib/ai/openai.ts`

```diff
+  const safeMessages = sanitizeChatMessagesForProvider(messages);
+  assertOpenRouterPayloadSafe(safeMessages);
   const payload = {
-    messages,
+    messages: safeMessages,
   };

-  console.error(..., errBody);
+  console.error(..., redactSensitiveText(errBody));
```

### `src/lib/ai/workspace-assistant.ts`

```diff
+  const safePendingCandidates = sanitizeClientContextsForTransport(pendingClientCandidates ?? undefined) ?? null;

-      reply: debugReply,
+      reply: redactSensitiveText(debugReply),

-    pendingClientCandidates,
+    safePendingCandidates,  // follow-up resolution

-    pendingClientCandidates: pendingForUi,
+    pendingClientCandidates: pendingCandidatesForTransport(pendingForUi),
```

### `src/app/api/ai-workspace/route.ts`

```diff
-  const pendingClientCandidates = body.pendingClientCandidates ?? null;
+  const pendingClientCandidates = sanitizeClientContextsForTransport(body.pendingClientCandidates) ?? null;

+  pendingClientCandidates: sanitizeClientContextsForTransport(chunk.pendingClientCandidates),  // SSE meta
+  pendingClientCandidates: sanitizeClientContextsForTransport(result.pendingClientCandidates),  // JSON response
```

### `src/lib/ai/workspace-chats.ts`

```diff
+  messages: sanitizeWorkspaceChatTurns(messages),   // updateWorkspaceChat
+  messages: sanitizeWorkspaceChatTurns(session.messages),  // getWorkspaceChat
```

### `package.json`

```diff
+ src/lib/ai/context-redaction.test.ts
```

---

## Проверки по каналам утечки

| Канал | До | После |
|-------|-----|-------|
| `/debug_client` Raw row JSON | `appPassword` в JSON | Ключ удалён (`redactDebugRow`) |
| `/debug_client` Raw scan | Значение из колонки `appPassword` | `[REDACTED]` |
| `debugRow` в памяти | Содержал `appPassword` | Не создаётся / redact при merge |
| `pendingClientCandidates` POST/SSE | Полный `debugRow` | `sanitizeClientContextsForTransport` |
| OpenRouter `messages` | Теоретический leak через debug echo | `sanitizeChatMessagesForProvider` |
| Server logs `[ai-client-search]` | Plain query | `redactForLogging` |
| Workspace chat persist | Plain assistant text | `sanitizeWorkspaceChatTurns` |
| `formatClientForAi` / CLIENT CONTEXT | Не содержал `appPassword` | Без изменений ✅ |

---

## Тесты

Новый файл `context-redaction.test.ts`:

- `isSensitiveFieldKey` — appPassword, пароль
- `redactDebugRow` — удаление sensitive keys, сохранение passport
- `sanitizeClientContextForTransport`
- `redactSensitiveText` — JSON и inline labels
- `sanitizeChatMessagesForProvider` — OpenRouter payload
- `sanitizeWorkspaceChatTurns` — chat persistence
- `redactForLogging` — nested objects

```bash
npm test
# ℹ tests 62 | pass 62 | fail 0
```

---

## Ограничения и follow-up (не в Phase A)

1. **CRM UI** — колонка «Пароль для приложения» в таблице клиентов не трогалась (рабочий UI).
2. **Legacy chat history** — при чтении применяется redaction; старые записи с leak будут показаны с `[REDACTED]`.
3. **Guardrails** — отдельная фаза (см. `AI_GUARDRAILS_AND_SECURITY_AUDIT.md`).

---

## Деплой

Не выполнялся. Merge не выполнялся. ENV не менялся.
