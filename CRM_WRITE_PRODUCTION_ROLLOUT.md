# CRM Write Production Rollout Plan

**Дата:** 16 июня 2026  
**Режим:** только план внедрения (без изменений кода, без записи в CRM, без смены флагов)

---

## Scope

Подготовка production-запуска для:

1. внедрения `Desk-aware dedup` в Lead Review pipeline;  
2. безопасного перехода от Dry Run к real CRM write.

Основа: `CRM_DEDUP_GAP_ANALYSIS.md`, `DESK_DEDUP_DESIGN.md`, `CRM_WRITE_GO_LIVE_READINESS.md`.

---

## 1) Файлы, которые потребуется изменить

### Core dedup and write pipeline

- `src/lib/leads/lead-review-service.ts`
- `src/lib/leads/lead-review-dedup.ts`
- `src/lib/leads/lead-review-types.ts`
- `src/lib/ai/client-deduplication.ts`

### Emigrant Desk integration layer

- `src/lib/emigrant-desk/clients.ts` (использование существующего fetch API для dedup-сравнений)
- `src/lib/emigrant-desk/types.ts` (если потребуется расширение типа для dedup metadata)

### API and error mapping

- `src/app/api/crm/leads/[id]/route.ts`

### UI (только если нужно явно показывать Desk-источник дубля)

- `src/components/leads/LeadReviewDetailView.tsx`
- `src/components/leads/LeadReviewQueueView.tsx`
- `src/components/leads/LeadReviewStatusBadge.tsx`

### Config / docs

- `.env.example` (документировать/добавить dedup-related toggles, если решите вводить)
- `CRM_WRITE_PHASE1_IMPLEMENTATION.md` (обновить после go-live)
- `DESK_DEDUP_DESIGN.md` (фиксировать финальные принятые правила)

---

## 2) Функции, которые потребуется изменить

### `src/lib/leads/lead-review-service.ts`

- `loadFormgridContexts()`  
  Добавить загрузку `deskContexts` (через `listEmigrantDeskClients()` + адаптер в сравнимый контекст).

- `getLeadReviewDetail()` и `listLeadReviewQueue()`  
  Передавать Desk-контексты в dedup-анализ, чтобы UI/API уже видели Desk-совпадения.

- `applyLeadReviewAction()`  
  Блокировать `create_in_crm` при Desk-strong duplicate (HTTP 409), аналогично CRM/Formgrid strong.

### `src/lib/leads/lead-review-dedup.ts`

- `analyzeLeadDuplicates(...)`  
  Расширить сигнатуру: добавить `deskContexts`.
  
- Добавить source `"desk"` в `LeadDuplicateMatch` наполнение.

- Добавить reason labels для Desk-сигналов (например: `desk_case_number`, `desk_email`, `desk_name`).

### `src/lib/ai/client-deduplication.ts`

- Добавить Desk-aware сравнение (или отдельную helper-функцию), чтобы не ломать текущие CRM/Formgrid кейсы.

- Обеспечить матрицу силы:
  - STRONG: `Desk case_number == passport`, `Desk email == email`
  - MEDIUM: `Desk full_name` (surname+name)
  - WEAK: partial/fuzzy only

### `src/lib/leads/lead-review-types.ts`

- Расширить `LeadDuplicateMatch["source"]` -> добавить `"desk"`.
- (Опционально) добавить dedup confidence для UI (`strong | medium | weak`).

### `src/app/api/crm/leads/[id]/route.ts`

- Сохранить текущий контракт 409/422.
- Уточнить `code`/`message` для Desk-дубликатов (например, `duplicate_detected_desk`), чтобы UI показывал понятный reason.

---

## 3) Какие тесты нужно добавить

### Unit: dedup logic

Файл: `src/lib/ai/client-deduplication.test.ts`

- Desk case_number == passport -> `isDuplicate=true` (STRONG).
- Desk email exact match -> `isDuplicate=true` (STRONG).
- Desk surname+name only -> `isPossibleDuplicate=true` (MEDIUM), без auto-block.
- Разные паспорта при похожем ФИО -> не STRONG.
- Нормализация (`ё/е`, пробелы, регистр) для Desk name/email.

### Unit: lead dedup aggregation

Новый/существующий тест рядом с `src/lib/leads/lead-review-dedup.ts`:

- `analyzeLeadDuplicates` возвращает `source=desk` в strongMatches.
- При одновременных CRM и Desk совпадениях нет дублирования одной и той же причины.

### Service: action flow

Файл: тесты для `src/lib/leads/lead-review-service.ts`

- `create_in_crm` + Desk strong duplicate -> кидает `LeadReviewActionError(409, ...)`.
- `create_in_crm` + Desk medium only -> не 409, остается manual-review path.
- Fail-closed не нарушается: `created_in_crm` только после успешного append.

### API integration

Файл: тесты `src/app/api/crm/leads/[id]/route.ts`

- PATCH `create_in_crm` при Desk duplicate -> HTTP 409 + code.
- PATCH при validation error -> HTTP 422 (регрессия check).

---

## 4) Manual test scenarios (обязательные)

1. **Новый клиент**
   - Нет совпадений в CRM/Formgrid/Desk.
   - Ожидание: в dry-run success preview; при write mode — append проходит.

2. **Дубль CRM**
   - Совпадение по паспорту в CRM.
   - Ожидание: 409, append не вызывается.

3. **Дубль Formgrid**
   - Совпадение с другим лидом Formgrid по strong сигналу.
   - Ожидание: 409, append не вызывается.

4. **Дубль Desk**
   - Совпадение по `Desk case_number == passport` (и/или Desk email).
   - Ожидание: 409, append не вызывается, reason содержит Desk.

5. **Тестовый клиент**
   - ФИО с test-маркером (`test/тест`) или служебный email.
   - Ожидание: 422 validation error, append не вызывается.

---

## 5) Пошаговый Production Rollout Plan

### Этап 1 — Desk-aware dedup implementation

- Внедрить Desk source в dedup pipeline.
- Добавить reason mapping и API ошибки для Desk duplicate.
- Прогнать unit/integration тесты.

**Гейт перехода:** все тесты green, no regression в существующем CRM/Formgrid dedup.

### Этап 2 — Dry Run повторно на всех лидах

- Запустить полный dry-run аудит на текущем Formgrid наборе.
- Зафиксировать:
  - сколько блокируется как strong duplicate;
  - сколько уходит в manual review;
  - сколько safe candidates.

**Гейт перехода:** все 3 известных Desk-дубля блокируются автоматически.

### Этап 3 — `CRM_WRITE_ENABLED=true` для тестового клиента

- Только на заранее согласованном 1 тест-кейсе (не production-клиент).
- `CRM_WRITE_DRY_RUN=false` только на время точечного smoke.

**Гейт перехода:** один контролируемый append, без side-effects в других лидах.

### Этап 4 — Проверка строки в CRM

- Подтвердить физическое появление строки в `'В Работе'!A:M`.
- Проверить правильность колонок (паспорт, дата подачи, заметка, и т.д.).
- Проверить, что `created_in_crm` выставлен только после append.

**Гейт перехода:** строка валидна, статусы корректны, cache/UI консистентны.

### Этап 5 — Полный запуск

- Включить real write для production потока.
- Запускать по канареечной стратегии:
  - сначала ограниченный пул лидов/операторов,
  - затем полный трафик.

**Гейт перехода:** нет неожиданных 5xx/409 всплесков, нет ложных append.

### Этап 6 — Мониторинг первые 7 дней

- Ежедневный контроль:
  - count `create_in_crm` attempts,
  - count `409 duplicate_detected` (с breakdown CRM/Formgrid/Desk),
  - count `422 validation_error`,
  - count успешных append.
- Ежедневная ручная выборка минимум 5 успешных кейсов + все спорные блокировки.

**Критерий стабильности:** 7 дней без инцидентов дублей/потерь данных.

---

## 6) Rollback Plan

### Триггеры rollback

- обнаружен новый дубль после auto-create;
- массовые ложные 409 (блокируется валидный новый клиент);
- некорректная запись структуры строки в CRM;
- рост 5xx на PATCH `create_in_crm`.

### Immediate rollback (операционный)

1. Переключить в safe режим:
   - `CRM_WRITE_ENABLED=false`
   - `CRM_WRITE_DRY_RUN=true`
2. Остановить production append немедленно.
3. Сохранить список инцидентных лидов и request traces.

### Functional rollback

4. Отключить Desk-aware правила (feature-guard или revert commit).
5. Вернуть предыдущий dedup behavior (CRM/Formgrid only).
6. Повторить dry-run на тех же лидах и сравнить deltas.

### Data rollback / remediation

7. Для ошибочно созданных строк:
   - ручной review по журналу append-событий;
   - целевое удаление/пометка только подтвержденных ошибочных строк по согласованию.

8. Пост-мортем:
   - root cause,
   - контрмеры в тестах/правилах,
   - обновление rollout checklist.

---

## Definition of Done для Go-Live

- Desk-aware dedup внедрен и покрыт тестами.
- Все 5 manual сценариев пройдены.
- Повторный dry-run подтверждает блокировку известных дублей.
- Точечный write smoke успешен.
- Мониторинг и rollback runbook доступны on-call команде.
