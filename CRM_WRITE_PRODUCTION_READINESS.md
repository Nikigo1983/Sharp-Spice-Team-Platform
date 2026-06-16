# CRM Write Production Readiness

**Дата:** 16 июня 2026  
**Режим:** только технический план готовности  
**Ограничения соблюдены:** без записи в CRM, без тестовых клиентов, без миграций, без изменения данных.

---

## ЧАСТЬ 1. Dry Run Architecture

Целевой путь выполнения для кнопки **«Создать клиента»**:

```text
Lead Review Queue
↓
Создать клиента
↓
Validation
↓
Dedup Check
↓
Build CRM Row
↓
Dry Run
↓
Log Result
```

### Реальные файлы и функции (текущие + целевые точки расширения)

| Этап | Текущая функция/файл | Что есть сейчас | Что нужно для readiness |
|------|----------------------|-----------------|-------------------------|
| UI click | `LeadReviewDetailView.runAction("create_in_crm")` в `src/components/leads/LeadReviewDetailView.tsx` | PATCH вызов работает | Оставить, добавить отображение dry-run result |
| API вход | `PATCH` в `src/app/api/crm/leads/[id]/route.ts` | action парсится и передается в сервис | Добавить статус-коды 422/409/403/404/429/500 |
| Оркестрация | `applyLeadReviewAction()` в `src/lib/leads/lead-review-service.ts` | меняет только review status | Добавить pipeline: validate → dedup → buildRow → dry-run/log |
| Lead data | `getLeadReviewDetail()` в том же сервисе | отдает `passport/phone/email`, dedup | Переиспользовать как входные данные |
| Dedup | `analyzeLeadDuplicates()` в `src/lib/leads/lead-review-dedup.ts` + `areClientsDuplicates()` в `src/lib/ai/client-deduplication.ts` | strong/possible уже есть | Добавить финальную decision-матрицу (block/warn/allow) |
| Passport normalize | `normalizePassport()` в `src/lib/ai/client-passport.ts` | длина/нормализация есть | Использовать как mandatory check |
| CRM column map | `COL` (A..M) в `parseCroatiaExternalClientsRows()` `src/lib/google-sheets/parse.ts` | порядок External известен | Добавить builder `Formgrid -> [A..M]` |
| Sheets append infra | private `appendRow()` в `src/lib/google-sheets/google-sheets-client.ts` | технически есть, но не используется для клиентов | Для dry-run append не вызывать; only simulate+log |
| Logging state | `upsertLeadReview()` в `src/lib/leads/lead-review-store.ts` | сохраняет note/status | Писать structured dry-run log в note/app_state |

### Текущее фактическое поведение

`create_in_crm` сейчас:

- не вызывает Google Sheets API;
- не строит CRM row;
- сохраняет только `status: created_in_crm`, `pendingCrmClientId`, `note` в Lead Review store.

---

## ЧАСТЬ 2. Feature Flags

Рекомендуемые флаги:

- `CRM_WRITE_ENABLED`
- `CRM_WRITE_DRY_RUN`

### Матрица режимов (как требуется)

| ENABLED | DRY_RUN | Поведение |
|---------|---------|-----------|
| false | false | только статус (как сейчас) |
| false | true | симуляция (validation+dedup+buildRow+log, без append) |
| true | true | запись запрещена (safe-guard: dry-run имеет приоритет, append blocked) |
| true | false | реальная запись (после Go) |

### Рекомендуемая схема приоритета

```text
if DRY_RUN = true:
  append всегда запрещен
  pipeline выполняется до buildRow + лог
else if ENABLED = true:
  разрешить append (только после checklist)
else:
  legacy status-only
```

### Рекомендуемый rollout

1. `ENABLED=false`, `DRY_RUN=false` (текущее).
2. `ENABLED=false`, `DRY_RUN=true` (проверка readiness).
3. После Go/No-Go: `ENABLED=true`, `DRY_RUN=false`.

---

## ЧАСТЬ 3. Валидация клиента

Проверки перед любым `build CRM row`.

### 3.1. Паспорт

База: `normalizePassport()` + `PASSPORT_MIN_NORMALIZED_LENGTH=6`.

Правила:

1. Не пустой.
2. После нормализации длина >= 6.
3. Только буквы/цифры (после удаления `№`, пробелов, дефисов).
4. Не содержит ошибок вида `#ERROR!`.

Пример ошибки: `422 VALIDATION_ERROR: passport_invalid`.

### 3.2. Телефон

Правила:

1. Не пустой.
2. Не `#ERROR!`.
3. После очистки `\D` минимум 10 цифр (для write policy; dedup сейчас использует 7+).

Пример ошибки: `422 VALIDATION_ERROR: phone_invalid`.

### 3.3. ФИО

Правила:

1. Не пустое.
2. Минимум 2 слова (фамилия + имя).
3. Исключить тестовые шаблоны (`test`, `тест`, `asd`, `qwe`, etc.).

Пример ошибки: `422 VALIDATION_ERROR: name_invalid`.

### 3.4. Политика обязательности (рекомендованная)

Hard required:

- ФИО
- Паспорт
- Телефон

Soft required:

- Email (warning, не блокирует)

---

## ЧАСТЬ 4. Защита от дублей

База: `areClientsDuplicates()` (passport/email/phone/telegram => strong; FIO => possible).

### Порядок проверки

1. Паспорт
2. Телефон
3. Email
4. Telegram
5. ФИО

### Decision matrix

| Ключ | Тип совпадения | Решение |
|------|----------------|---------|
| Паспорт | strong | **AUTO BLOCK (409)** |
| Телефон | strong | **AUTO BLOCK (409)** |
| Email | strong | **AUTO BLOCK (409)** |
| Telegram | strong | **AUTO BLOCK (409)** |
| ФИО (surname+name/partial/normalized) | possible | **WARNING + manual confirm** (не auto block) |
| Паспорт conflict (оба валидны и разные) | conflict | **AUTO BLOCK** merge/append по ФИО запрещен |

### Итоговый алгоритм

```text
run dedup
if any strong CRM match:
  block 409
else if possible-only:
  warn, allow only with explicit confirm/mark_reviewed
else:
  allow
```

---

## ЧАСТЬ 5. Формирование строки CRM (A–M)

Источник колонок: `parse.ts` (`COL.family ... COL.partner`).

### Mapping Formgrid -> CRM External

| CRM Col | Поле CRM | Источник Formgrid | Трансформация |
|---------|----------|-------------------|---------------|
| A | Фамилия | `fields.name` | первый токен ФИО |
| B | ФИО латиницей | анкета латиницей | as-is / пусто |
| C | Номер паспорта | `fields.passport` | raw + normalized check |
| D | Дата подачи | `fields.submittedAt` | dd.mm.yyyy |
| E | Дата предполагаемого одобрения | — | `""` |
| F | Имя референта | — | `""` |
| G | Адрес букинга | — | `""` |
| H | Дата букинга | — | `""` |
| I | Дата одобрения ВНЖ | — | `""` |
| J | Заметки | несколько полей FG | шаблон import note |
| K | Дата выдачи карточки ВНЖ | — | `""` |
| L | Пароль приложения | — | `""` |
| M | Партнёр | — | `""` |

### Пример массива значений (без записи)

Кейс: `Белкания Автандил Яношевич` (как dry-run example, без append):

```text
[
  "Белкания",
  "",
  "77 5045756",
  "<submittedAt из FG>",
  "",
  "",
  "",
  "",
  "",
  "[Lead Review dry-run] ФИО: Белкания Автандил Яношевич; Телефон: #ERROR!; Email: Name.dilon7711@gmail.com",
  "",
  "",
  ""
]
```

В этом примере validation должна остановить pipeline до append из-за `phone=#ERROR!`.

---

## ЧАСТЬ 6. Ошибки

| Код | Причина | Что видит менеджер | Что пишется в лог |
|-----|---------|--------------------|-------------------|
| 422 Validation Error | невалидное ФИО/паспорт/телефон | `Нельзя создать клиента: некорректные данные анкеты` + поле | `validation_failed`, field, raw_value, sheetRow |
| 409 Duplicate | strong match в CRM | `Дубликат найден. Клиент уже есть в CRM` + clientId | `duplicate_blocked`, reasons, matchedClientId |
| 403 Permission | SA без Editor / ACL | `Нет прав записи в CRM` | `write_forbidden`, spreadsheetId, serviceAccount |
| 404 Sheet Not Found | неверный ID/gid/range External | `CRM лист не найден` | `sheet_not_found`, range, spreadsheetId |
| 429 Rate Limit | Google API quota/rate exceeded | `CRM временно недоступна, повторите позже` | `rate_limited`, retryAfter |
| 500 Internal Error | непредвиденная серверная ошибка | `Ошибка сервера при подготовке создания` | stack trace + correlationId |

### Dry-run log format (рекомендуемый)

```json
{
  "mode": "dry_run",
  "sheetRow": 6,
  "action": "create_in_crm",
  "validation": {"ok": false, "errors": ["phone_invalid"]},
  "dedup": {"strong": false, "possible": true, "reasons": ["fio"]},
  "crmRowPreview": ["...A..M..."],
  "appendAttempted": false,
  "timestamp": "..."
}
```

---

## ЧАСТЬ 7. Rollback

Если после включения real write появились ошибки:

1. Немедленно:
   - `CRM_WRITE_ENABLED=false`
   - (опционально) `CRM_WRITE_DRY_RUN=true` для диагностики без записи.
2. Проверить последние операции по логам/correlationId.
3. Временные данные безопасны:
   - CRM не получает новых строк после выключения;
   - Lead Review state остается в app_state;
   - уже созданные строки (до отключения) остаются и требуют ручной ревизии.

### Что остается безопасным

- База Supabase и очередь лидов не ломаются.
- Read-only функции `/clients`, AI, analytics продолжают работать.
- Отключение флага не требует миграций.

---

## ЧАСТЬ 8. Финальный Go/No-Go Checklist

- [ ] CRM migrated to native Google Sheet
- [ ] Service Account Editor access verified
- [ ] External sheet verified
- [ ] GOOGLE_SHEETS_CLIENTS_RANGE configured
- [ ] Validation working
- [ ] Dedup working
- [ ] Dry Run passed
- [ ] Test append passed
- [ ] Rollback tested

### Дополнительно рекомендуется

- [ ] `create_in_crm` возвращает 409 при strong duplicate
- [ ] `created_in_crm` ставится только после успешного append
- [ ] UI показывает причину блокировки и matched client link
- [ ] `relocation/forms.ts` ссылка обновлена на новый ID/gid

---

## Финальный статус готовности

Текущий статус: **NO-GO** для реальной записи (write-path не внедрен).  
Статус для подготовки: **GO** для Dry Run architecture и readiness-проверок.

Следующий безопасный шаг: включить только `CRM_WRITE_DRY_RUN=true` (при `CRM_WRITE_ENABLED=false`) и пройти checklist без единой записи в CRM.
