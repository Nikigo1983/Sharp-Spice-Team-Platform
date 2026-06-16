# DESIGN — Desk non-blocking dedup (PR design)

**Дата:** 16 июня 2026  
**Режим:** дизайн PR (без изменений кода)  
**Связанные документы:** `IMPACT_ANALYSIS.md`, `CRM_WRITE_POST_GO_LIVE_AUDIT.md`

---

## Цель PR

Убрать **Emigrant Desk** из блокирующей дедупликации при `create_in_crm`. Desk остаётся в карточке лида как **информационное предупреждение**; блокировка и красные/жёлтые «дубликат»-сигналы — только для **CRM** (и, as-is, **Formgrid strong**).

---

## Правила (to-be)

| # | Правило | HTTP / UX |
|---|---------|-----------|
| 1 | **CRM duplicate** (strong) | **HTTP 409** — без изменений |
| 2 | **Validation error** | **HTTP 422** — без изменений |
| 3 | **Emigrant Desk match** (strong или medium) | Только **info**-подсказка в UI |
| 4 | Desk **не** вызывает красный `alertError` при PATCH и **не** блокирует `create_in_crm` |
| 5 | В очереди **нет** бейджа «Возможный дубликат», если blocking strong есть **только** в Desk |
| 6 | **Formgrid strong** | **Вне scope этого PR** — остаётся blocking (409), как сейчас |

### Desk match levels (алгоритм `desk-dedup.ts` не меняется)

| Уровень | Сигналы | Роль после PR |
|---------|---------|---------------|
| Strong | `case_number` (= паспорт), email | Info |
| Medium | ФИО (фамилия + имя) | Info |

---

## Архитектура: разделение blocking vs info

### Сейчас

```
analyzeLeadDuplicates()
  → strongMatches = CRM ∪ Formgrid ∪ Desk
  → hasStrongMatch = strongMatches.length > 0
       ↓
  create_in_crm: if hasStrongMatch → 409
  queue badge:   if hasStrongMatch
  detail alert:  if hasStrongMatch  (alertStrong)
```

### После PR

```
analyzeLeadDuplicates()
  → blockingStrongMatches = CRM ∪ Formgrid   // strong only
  → deskStrongMatches, deskMediumMatches     // info only
  → hasBlockingStrongMatch
  → hasDeskHint = deskStrong ∪ deskMedium non-empty
       ↓
  create_in_crm: if hasBlockingStrongMatch → 409
  queue badge:   if hasBlockingStrongMatch
  detail alert:  alertStrong только при hasBlockingStrongMatch
                 alertInfo при hasDeskHint
```

**Принцип:** один источник правды в `lead-review-dedup.ts`; сервер и UI читают **одни и те же** флаги, без дублирования `filter(source !== 'desk')` в компонентах.

---

## Ожидаемое поведение по сценариям

### A. Только Desk strong (row 7, 11 в post-go-live срезе)

| Действие | Сейчас | После PR |
|----------|--------|----------|
| PATCH `create_in_crm` (при валидных полях) | 409 `duplicate_detected_desk` | **200** — проходит gate dedup |
| Верхний alert на карточке | `alertStrong` «Возможный дубликат» | **`alertInfo`** «Клиент может быть в Emigrant Desk» |
| Блок «Проверка дублей» | Desk в «надёжные совпадения» | Desk в **info**-секции (нейтральный заголовок) |
| Бейдж в очереди | «Возможный дубликат» | **нет** |
| PATCH error (`alertError`) | Красное сообщение про Desk | **не показывается** (create не падает на dedup) |

### B. CRM strong + Desk strong (rows 3, 4, 5, 8, 9, 10)

| Действие | Сейчас | После PR |
|----------|--------|----------|
| PATCH `create_in_crm` | 409 `duplicate_detected_crm` | **409** `duplicate_detected_crm` — без изменений |
| Верхний alert | `alertStrong` (все reasons) | `alertStrong` — **только CRM/Formgrid** reasons |
| Desk | В том же strong-блоке | Отдельный **`alertInfo`** ниже или в панели дублей |
| Бейдж в очереди | есть | **есть** (из‑за CRM) |

### C. Только Desk medium (ФИО)

| | Сейчас | После PR |
|---|--------|----------|
| Блокировка | нет | нет |
| UI | «Emigrant Desk — возможные совпадения (ФИО)» | То же, стиль **info** (не warning badge) |
| Бейдж в очереди | нет (`hasStrongDuplicate` false) | нет |

### D. Validation error (row 2, 6)

| | Сейчас | После PR |
|---|--------|----------|
| PATCH | 422 | 422 — без изменений |
| Desk hint | может отображаться параллельно | info Desk **не мешает** 422 |

### E. Desk API недоступен (`listEmigrantDeskClients()` → `[]`)

| | Сейчас | После PR |
|---|--------|----------|
| Поведение | fail-open, нет Desk matches | то же |

---

## Точный список файлов PR

### 1. Типы и dedup-ядро

| Файл | Изменение |
|------|-----------|
| **`src/lib/leads/lead-review-types.ts`** | Расширить `LeadDedupAnalysis`: `blockingStrongMatches`, `deskStrongMatches`, `deskMediumMatches`, `hasBlockingStrongMatch`, `hasDeskHint`. Опционально: пометить `hasStrongMatch` как alias → `hasBlockingStrongMatch` (deprecated) или удалить из публичного контракта API. |
| **`src/lib/leads/lead-review-dedup.ts`** | Desk strong → `deskStrongMatches` (не в `blockingStrongMatches`). Desk medium → `deskMediumMatches`. CRM/Formgrid strong → `blockingStrongMatches`. Пересчитать флаги. |
| **`src/lib/leads/desk-dedup.ts`** | **Без изменений** |
| **`src/lib/emigrant-desk/*`** | **Без изменений** (загрузка клиентов нужна для hints) |

### 2. Серверный gate

| Файл | Изменение |
|------|-----------|
| **`src/lib/leads/lead-review-service.ts`** | `create_in_crm`: условие 409 → `detail.dedup.hasBlockingStrongMatch`. `resolveDuplicateErrorCode(detail.dedup.blockingStrongMatches)`. `toQueueItem`: `hasStrongDuplicate` ← `hasBlockingStrongMatch`. |
| **`src/app/api/crm/leads/[id]/route.ts`** | **Без изменений** (проксирует service) |

### 3. Коды ошибок

| Файл | Изменение |
|------|-----------|
| **`src/lib/leads/lead-review-action-errors.ts`** | `resolveDuplicateErrorCode`: вход только blocking matches (crm \| formgrid). Удалить ветку `duplicate_detected_desk` из 409-path. `formatLeadReviewActionUserMessage`: убрать или оставить `duplicate_detected_desk` как legacy (не эмитится). |

### 4. UI

| Файл | Изменение |
|------|-----------|
| **`src/components/leads/LeadReviewDetailView.tsx`** | `alertStrong` ← `hasBlockingStrongMatch` + reasons только blocking. Новый `alertInfo` для Desk (`hasDeskHint`). MatchBlock: переименовать заголовки Desk → «Emigrant Desk — информация (case / email)» / «… (ФИО)». Фильтры `deskStrong`/`deskMedium` читать из новых полей dedup. |
| **`src/components/leads/LeadReviewQueueView.tsx`** | **Без изменений в JSX**, если `hasStrongDuplicate` на сервере уже blocking-only. |
| **`src/components/leads/LeadReviewQueue.module.css`** | Добавить `.alertInfo` (нейтральный синий/серый, не жёлтый `alertStrong`). |

### 5. Тесты

| Файл | Изменение |
|------|-----------|
| **`src/lib/leads/lead-review-dedup.integration.test.ts`** | Desk strong: `hasBlockingStrongMatch === false`, `hasDeskHint === true`, match в `deskStrongMatches`. CRM+Desk: оба массива заполнены, blocking только CRM. |
| **`src/lib/leads/lead-review-action-errors.test.ts`** | Убрать/переписать тесты `duplicate_detected_desk` для 409. Оставить CRM / formgrid codes. |
| **`src/lib/leads/desk-dedup.test.ts`** | **Без изменений** |

### 6. Документация (в том же PR)

| Файл | Изменение |
|------|-----------|
| **`UX_CHANGE_REPORT.md`** | Секция: Desk → info, обновить таблицу кодов 409. |
| **`IMPACT_ANALYSIS.md`** | Ссылка «реализовано в PR #N» (опционально). |

### 7. Явно вне PR

| Область | Причина |
|---------|---------|
| `appendExternalClientRow`, `CRM_WRITE_*`, ENV | write-path не меняется |
| `scripts/post-go-live-audit.mjs` | отдельный follow-up (метрики `desk_hint`) |
| Formgrid blocking policy | не в scope |
| AI Workspace / `client-field-sources` | другой продуктовый контур |

---

## Контракт API (JSON)

### `GET /api/crm/leads/[id]` → `lead.dedup`

**Добавить / изменить:**

```ts
{
  blockingStrongMatches: LeadDuplicateMatch[];  // crm | formgrid
  deskStrongMatches: LeadDuplicateMatch[];
  deskMediumMatches: LeadDuplicateMatch[];
  hasBlockingStrongMatch: boolean;
  hasDeskHint: boolean;
  // mediumMatches / possibleMatches — только CRM/Formgrid (desk вынесен)
}
```

**Обратная совместимость:** если фронт на старой версии читает `hasStrongMatch` — на 1 релиз можно отдавать `hasStrongMatch: hasBlockingStrongMatch` с комментарием deprecate.

### `PATCH` при Desk-only lead

- **Было:** `{ error, code: "duplicate_detected_desk" }`, status 409  
- **Станет:** успех dedup-gate → дальше по `resolveCrmWriteMode()` (status_only / dry_run / write), как для «чистого» лида.

---

## UI copy (предлагаемые тексты)

| Элемент | Текст |
|---------|-------|
| `alertInfo` (Desk) | **«Информация: возможное совпадение с Emigrant Desk»** — «Проверьте case number / email / ФИО. Это не блокирует создание клиента в CRM.» |
| `alertStrong` (blocking) | Без изменений по смыслу: «Возможный дубликат» + CRM/Formgrid reasons |
| MatchBlock Desk strong | **«Emigrant Desk — совпадение (информация)»** |
| MatchBlock Desk medium | **«Emigrant Desk — похожее ФИО (информация)»** |
| Queue badge | Без изменений текста; показывается **только** при `hasBlockingStrongMatch` |

---

## Тест-план PR

### Автотесты

- [ ] `npm test` — все suite green  
- [ ] Desk-only strong → `hasBlockingStrongMatch === false`, `hasDeskHint === true`  
- [ ] CRM+Desk → `hasBlockingStrongMatch === true`, desk в отдельном массиве  
- [ ] `resolveDuplicateErrorCode` never returns `duplicate_detected_desk` для blocking set  

### Ручные (post-go-live rows)

| Row | ФИО | Ожидание |
|-----|-----|----------|
| 7 | Белоногова | info Desk, **нет** badge, create не 409 по Desk |
| 11 | Тайк | то же |
| 3 | Давлятова | 409 CRM, info Desk, badge есть |
| 2 | Белоусова тест 2 | 422, Desk irrelevant |
| 12 | ЕДРЕЦ | `created_in_crm`, кнопки disabled |

---

## Критерии приёмки

- [ ] Desk strong/medium **никогда** не приводят к HTTP 409  
- [ ] Код `duplicate_detected_desk` **не возвращается** из PATCH  
- [ ] `alertStrong` / `alertError` **не** показываются из‑за одного Desk  
- [ ] `alertInfo` показывается при любом Desk match  
- [ ] Бейдж «Возможный дубликат» только при CRM или Formgrid strong  
- [ ] CRM 409 и validation 422 работают как до PR  
- [ ] Write-path и ENV не затронуты  

---

## Ожидаемый data impact (11 лидов)

| Метрика | Δ |
|---------|---|
| Лидов с 409 только из‑за Desk | **−2** (rows 7, 11) |
| Лидов с 409 (CRM) | **6** — без изменений |
| Лидов с Desk info | **9** — без изменений по факту match, меняется только UX-tier |

---

## Предлагаемый PR

| Поле | Значение |
|------|----------|
| **Branch** | `feat/desk-non-blocking-dedup` |
| **Title** | Demote Emigrant Desk to informational hint in Lead Review dedup |
| **Base** | `main` (после merge BL-01/BL-02, если ещё не в main) |
| **Размер** | S–M (~8 файлов, ~150–250 LOC) |
| **Риск** | Средний — rows 7/11 можно создать в CRM при живом кейсе в Desk |

### Порядок коммитов (рекомендация)

1. `types + lead-review-dedup` — новая модель matching  
2. `lead-review-service + action-errors` — серверный gate  
3. `LeadReviewDetailView + CSS` — info UI  
4. `tests + UX_CHANGE_REPORT`  

---

## Открытые вопросы (не блокируют PR)

1. Нужен ли checkbox «Я проверил Desk» перед create при `hasDeskHint`? (soft gate, не HTTP)  
2. Ссылка на карточку Desk client по `clientId`?  
3. Отдельный follow-up: Formgrid strong → warning only?  

---

*Дизайн подготовлен по коду `lead-review-dedup.ts`, `lead-review-service.ts`, `LeadReviewDetailView.tsx` и данным `CRM_WRITE_POST_GO_LIVE_AUDIT.md`.*
