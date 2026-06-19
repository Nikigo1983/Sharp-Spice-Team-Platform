# Post-Go-Live Backlog — CRM Write & Lead Review

**Дата:** 16 июня 2026  
**Режим:** только анализ и backlog (без изменений кода)  
**Контекст:** merge `3755319` / `bfbabac`, первый успешный append (row 12, ЕДРЕЦ), post-go-live audit в `CRM_WRITE_POST_GO_LIVE_AUDIT.md`

---

## Текущее состояние (as-is)

| Область | Что есть сейчас | Проблема |
|---------|-----------------|----------|
| **Ошибки UI** | `LeadReviewDetailView.runAction()` при любом `!res.ok` показывает `"Не удалось выполнить действие"` | API отдаёт `{ error, code }` (409/422), UI их **не читает** |
| **Коды блокировки** | Сервер: `duplicate_detected`, `validation_error` (единый код для CRM/Desk/Formgrid) | Нет различия `duplicate_detected_crm` vs `duplicate_detected_desk` |
| **Dedup в UI** | Блоки MatchBlock по источникам (CRM / Formgrid / Desk) | Есть до нажатия кнопки; при 409 менеджер не видит **причину отказа** в toast/alert |
| **Аудит действий** | `LeadReviewRecord.updatedBy`, `updatedAt`, `note` в Supabase `app_state` | Нет отдельного журнала; нет истории неуспешных попыток |
| **Метрики** | Нет | Невозможно отслеживать rollout (creates vs blocks) |
| **Очередь** | `listLeadReviewQueue()` возвращает **все** строки Formgrid | Лиды `created_in_crm` остаются в списке (фильтр есть, auto-hide нет) |
| **Dedup quality** | Desk strong (case_number, email), CRM/Formgrid strong | Post-audit: row 6 `phone_invalid` (422 до dedup); MEDIUM Desk не блокирует; нет telegram в Desk |

---

## Приоритеты

| P | Эпик | Зачем сейчас |
|---|------|--------------|
| **P0** | Понятные ошибки 409/422 в UI | Менеджеры уже получают 409 на 8/11 лидов — без этого rollout «слепой» |
| **P0** | Коды и тексты блокировки по источнику | Разные действия: «открыть CRM» vs «открыть Desk» |
| **P1** | Журнал действий | Compliance + разбор инцидентов (кто создал ЕДРЕЦ) |
| **P1** | Метрики rollout | Контроль 7-дневного мониторинга из `CRM_WRITE_PRODUCTION_ROLLOUT.md` |
| **P2** | Очистка очереди | UX: не копить обработанные лиды |
| **P2** | Улучшение dedup | Снизить false LOW и пропуски (phone, MEDIUM policy) |

---

## Backlog

### BL-01 — Понятные сообщения вместо «Не удалось выполнить действие»

**Проблема:**  
`LeadReviewDetailView.tsx` строки 103–107: при `patch failed` всегда generic error. API (`route.ts`) уже возвращает структурированный JSON при `LeadReviewActionError`.

**Целевое поведение:**

| HTTP | Показывать менеджеру (пример) |
|------|-------------------------------|
| 409 | «Клиент не создан: найден дубликат в {источник}. {детали}» |
| 422 | «Клиент не создан: проверьте данные анкеты. {поле}: {причина}» |
| 500 | «Ошибка записи в Google Sheets. Обратитесь к администратору.» |

**Затрагиваемые файлы (при реализации):**

- `src/components/leads/LeadReviewDetailView.tsx` — парсить `res.json()`, маппинг `code` → текст
- `src/app/api/crm/leads/[id]/route.ts` — опционально: стабильный `userMessage` в теле ответа

**Критерии приёмки:**

- [ ] При 409/422 менеджер видит **конкретную** причину, не generic текст
- [ ] Успешный create по-прежнему обновляет карточку без ложной ошибки
- [ ] Ошибки сети отделены от бизнес-ошибок

**Оценка:** S (0.5–1 день)

---

### BL-02 — Коды и отображение причины блокировки

**Проблема:**  
Сервер бросает один код `duplicate_detected` для CRM, Formgrid и Desk (`lead-review-service.ts`). UI не показывает код ответа PATCH.

**Целевая таксономия кодов:**

| Код API | Когда | UI label |
|---------|-------|----------|
| `duplicate_detected_crm` | strong match source `crm` | «Дубликат в CRM» |
| `duplicate_detected_desk` | strong match source `desk` (без CRM strong) | «Клиент уже в Emigrant Desk» |
| `duplicate_detected_formgrid` | strong match source `formgrid` | «Дубликат в Formgrid» |
| `duplicate_detected_mixed` | несколько strong источников | «Дубликат в нескольких системах» |
| `validation_error` | `validateLeadForCrmCreate` | «Ошибка данных анкеты» |
| `validation_error:test_lead_detected` | test guard | «Тестовый лид — создание запрещено» |

**Реализация (концепт):**

1. В `applyLeadReviewAction()` при 409 вычислять **primary source** из `detail.dedup.strongMatches` (приоритет: CRM → Desk → Formgrid).
2. Расширить `LeadReviewActionError` полем `subcode` или заменить `code`.
3. UI: цветной alert (красный = block, жёлтый = validation) + ссылка на совпадение (CRM client / Desk case).

**Данные для UI уже есть в GET:** `lead.dedup.strongMatches` — можно показывать **до** PATCH; PATCH-ошибка должна **дублировать** те же match-блоки с акцентом.

**Критерии приёмки:**

- [ ] Менеджер различает блокировку CRM и Desk без чтения логов
- [ ] Для Desk показывается `case_number` / email match
- [ ] Test lead (row 2) показывает отдельное сообщение, не «дубликат»

**Оценка:** M (1–2 дня)

---

### BL-03 — Журнал действий менеджеров

**Проблема:**  
`LeadReviewRecord` хранит только **последнее** состояние (`updatedBy`, `updatedAt`). Нет записи о неуспешных `create_in_crm`, dry-run preview, rollback.

**Целевая модель события:**

```ts
type LeadReviewAuditEvent = {
  id: string;
  at: string;              // ISO
  actorId: string;           // session.id
  actorName: string;         // session.name
  action: LeadReviewAction;
  sheetRow: number;
  rowKey: string;
  leadName: string;
  outcome: "success" | "blocked" | "error";
  httpStatus?: number;
  code?: string;             // duplicate_detected_desk, validation_error, …
  crmSpreadsheetId?: string;
  crmTargetRange?: string;
  note?: string;
};
```

**Хранение (варианты):**

| Вариант | Плюсы | Минусы |
|---------|-------|--------|
| Supabase таблица `lead_review_audit` | Запросы, индексы, дашборд | Миграция |
| Append-only массив в `app_state` | Быстрый старт | Рост JSON, нет пагинации |
| Лог в `note` (текущее) | Уже есть | Неструктурированно |

**Рекомендация:** Supabase таблица + UI «История» на карточке лида.

**Минимальные поля для compliance:**

- кто создал клиента (`updatedBy` → audit event)
- когда (`updatedAt`)
- из какого лида (`sheetRow`, `rowKey`, ФИО)

**Критерии приёмки:**

- [ ] Успешный append row 12 виден в журнале с actor + timestamp
- [ ] Неуспешный 409 тоже пишется (blocked)
- [ ] Owner может выгрузить журнал за период

**Оценка:** M (2–3 дня с Supabase)

---

### BL-04 — Метрики CRM Write

**Проблема:**  
Rollout plan требует ежедневный счётчик attempts / 409 / 422 / success — в коде счётчиков нет.

**Целевые метрики:**

| Метрика | Описание | Источник |
|---------|----------|----------|
| `successful_creates` | append OK + `created_in_crm` | audit log / review store |
| `blocked_duplicates` | HTTP 409, breakdown по `duplicate_detected_*` | audit log |
| `validation_errors` | HTTP 422, breakdown по полю | audit log |
| `dry_run_previews` | mode `dry_run` / `status_only` | `crmWritePreview.mode` |
| `append_failures` | HTTP 500 `append_failed` | audit log |

**Варианты доставки:**

1. **Внутренний API** `GET /api/crm/leads/metrics?from=&to=` (owner only)
2. **Блок на `/analytics`** (рядом с Croatia analytics)
3. **Supabase view** + простая карточка в Dashboard

**Критерии приёмки:**

- [ ] За 7 дней rollout видно: creates, blocks, validation errors
- [ ] Breakdown CRM vs Desk duplicates
- [ ] Нет PII в метриках (только counts + codes)

**Оценка:** M (2 дня после BL-03)

---

### BL-05 — Очистка очереди лидов после `create_in_crm`

**Проблема:**  
`listLeadReviewQueue()` всегда маппит все `formgrid.rows`. Статус `created_in_crm` только меняет badge — лид остаётся в очереди (11 строк → после обработки визуальный шум).

**Варианты (выбрать один):**

| # | Поведение | Сложность |
|---|-----------|-----------|
| A | **Default filter:** скрывать `created_in_crm` и `rejected` (toggle «Показать обработанные») | S |
| B | **Отдельная вкладка** «Архив» | S |
| C | **Auto-archive:** не возвращать из API лиды старше N дней с финальным статусом | M |
| D | **Физическое удаление** из Formgrid | Не рекомендуется |

**Рекомендация:** A + B (фильтр по умолчанию + архивная вкладка). Formgrid остаётся source of truth; скрытие только в UI/API query param `?hideProcessed=true`.

**Критерии приёмки:**

- [ ] После успешного create лид не в «активной» очереди по умолчанию
- [ ] Лид доступен в архиве / фильтре «Создан в CRM»
- [ ] Счётчик «к обработке» показывает только `new` + `reviewed` без strong dup

**Оценка:** S (0.5–1 день)

---

### BL-06 — Улучшение качества дедупликации

**Наблюдения post-go-live** (`CRM_WRITE_POST_GO_LIVE_AUDIT.md`):

| Кейс | Сейчас | Риск |
|------|--------|------|
| 9 Desk strong | Блок 409 ✓ | — |
| row 6 Белкания | Desk strong, но `phone_invalid` → 422 раньше dedup | Менеджер видит «ошибка телефона», не «дубликат Desk» |
| row 2 test | test guard ✓ | — |
| MEDIUM Desk (только ФИО) | Не блокирует create | Осознанный policy; нужен UI warning |
| Telegram | В CRM/Formgrid strong, **не** в Desk | Пробел если telegram только в Desk |
| Нормализация телефона | CRM 7+ цифр, write policy 10+ | Расхождение dedup vs validation |

**Предлагаемые улучшения (по приоритету):**

1. **BL-06a — Порядок проверок при create:** при наличии strong dup показывать 409 **даже если** phone invalid (или combined error с двумя причинами).  
   *Сейчас:* validation → dedup; для row 6 менеджер не узнает про Desk.

2. **BL-06b — MEDIUM Desk → soft block:** не 409, но confirm dialog «Возможное совпадение в Desk по ФИО — продолжить?» (opt-in для опытных менеджеров).

3. **BL-06c — Единая нормализация телефона** между `client-deduplication` и `lead-create-validation`.

4. **BL-06d — Desk telegram** (если появится поле в Desk API): добавить в `checkLeadAgainstDesk`.

5. **BL-06e — Метрика false LOW rate:** доля лидов, получивших append без последующего ручного merge в CRM (ретроспектива через 30 дней).

**Критерии приёмки (минимум для закрытия эпика):**

- [ ] row 6 сценарий: менеджер видит и validation, и Desk duplicate (не только phone)
- [ ] Документирована матрица STRONG/MEDIUM/LOW для Desk
- [ ] Post-audit HIGH count стабилен при добавлении новых лидов

**Оценка:** L (3–5 дней, итеративно)

---

## Рекомендуемая последовательность спринтов

```text
Спринт 1 (UX unblock)
  BL-01 → BL-02

Спринт 2 (observability)
  BL-03 → BL-04

Спринт 3 (UX + quality)
  BL-05 → BL-06a → BL-06c
```

---

## Зависимости от инфраструктуры (вне backlog, но блокируют «полный» rollout)

Эти пункты **не** входят в UI-backlog, но из post-go-live audit всё ещё открыты:

- Cutover `GOOGLE_SHEETS_SPREADSHEET_ID` на native Sheet (`1zMv0ySpJAPtTQHPgB96dLvhGDKetm9HR1b3l9yFy_6U`)
- Стабильные production флаги `CRM_WRITE_ENABLED` / `CRM_WRITE_DRY_RUN`
- Верификация физической строки ЕДРЕЦ в целевой CRM-таблице

---

## Сводка

| ID | Название | Приоритет | Оценка |
|----|----------|-----------|--------|
| BL-01 | Понятные ошибки вместо generic | P0 | S |
| BL-02 | Коды блокировки CRM / Desk / validation | P0 | M |
| BL-03 | Журнал действий менеджеров | P1 | M |
| BL-04 | Метрики successful_creates / blocks / validation | P1 | M |
| BL-05 | Очистка / архив очереди | P2 | S |
| BL-06 | Улучшение dedup (подзадачи a–e) | P2 | L |

**Итог:** после первого успешного append (ЕДРЕЦ) главный UX-разрыв — **менеджер не видит причину отказа API**. Закрытие BL-01 и BL-02 — минимум для безопасной эксплуатации; BL-03/04 — для завершения rollout по плану мониторинга.

---

*Документ подготовлен на основе кода `LeadReviewDetailView.tsx`, `lead-review-service.ts`, `CRM_WRITE_POST_GO_LIVE_AUDIT.md`. Изменений в репозитории не вносилось, кроме этого файла.*
