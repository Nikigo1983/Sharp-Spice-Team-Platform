# Impact Analysis — Emigrant Desk в CRM dedup

**Дата:** 16 июня 2026  
**Режим:** только анализ (без изменений кода)  
**Цель:** убрать Emigrant Desk из **блокирующей** логики `create_in_crm`; оставить Desk как **информационную подсказку**.

**Контекст данных:** `CRM_WRITE_POST_GO_LIVE_AUDIT.md` (11 лидов Formgrid, 88 клиентов Emigrant Desk, Lead Review store Supabase).

---

## Краткий вывод

| Метрика | Сейчас | После demote Desk (CRM/Formgrid блок остаётся as-is) |
|---------|--------|------------------------------------------------------|
| Лидов с Desk **strong** | **9** | 9 (подсказка остаётся) |
| Лидов с HTTP **409** при `create_in_crm` (при валидных полях) | **8** | **6** (−2) |
| Лидов, блокируемых **только** Desk (без CRM/Formgrid strong) | **2** | **0** |
| Лидов с бейджем «Возможный дубликат» в очереди (если считать только blocking strong) | **9** | **6** (−3)* |

\* Точное число бейджей зависит от наличия Formgrid-only strong; в текущем срезе таких лидов нет.

**Главный эффект:** перестанут блокироваться **2 лида** — row **7** (Белоногова) и row **11** (Тайк). Остальные 6 из 8 текущих 409 по-прежнему блокируются из‑за **CRM strong** (паспорт).

---

## As-is: как Desk участвует в dedup сегодня

### Цепочка данных

```
Formgrid lead
  → analyzeLeadDuplicates()          [lead-review-dedup.ts]
      → CRM / Formgrid: areClientsDuplicates()
      → Desk: checkLeadAgainstDesk() [desk-dedup.ts]
  → hasStrongMatch = ANY strong (crm | formgrid | desk)
  → applyLeadReviewAction(create_in_crm)
      → if hasStrongMatch → HTTP 409   [lead-review-service.ts:285]
```

### Правила Desk (без изменений в этом анализе)

| Уровень | Сигналы | Сейчас в `strongMatches` | Блокирует create? |
|---------|---------|--------------------------|-------------------|
| **Strong** | `case_number` (= паспорт лида), email | да | **да** (через общий `hasStrongMatch`) |
| **Medium** | ФИО (фамилия + имя) | `mediumMatches` | нет |
| **Possible** | — | — | нет |

### Где Desk влияет на UX и API

| Место | Поведение |
|-------|-----------|
| `applyLeadReviewAction` | Любой strong Desk → 409, код `duplicate_detected_desk` (если нет CRM strong) |
| `listLeadReviewQueue` | `hasStrongDuplicate = dedup.hasStrongMatch` (включая Desk) |
| `LeadReviewDetailView` | Красный alert при `hasStrongMatch`; Desk в блоке «надёжные совпадения» |
| `LeadReviewQueueView` | Бейдж «Возможный дубликат» при `hasStrongDuplicate` |
| Кнопка «Создать в CRM» | **Не** отключается по dedup (блок только на сервере при PATCH) |

Desk **не** участвует в `appendExternalClientRow` / Google Sheets write-path — только в pre-write gate.

---

## To-be: целевые правила (из запроса)

| Источник | Роль | Блокирует `create_in_crm`? |
|----------|------|----------------------------|
| **CRM** | предупреждение **или** блокировка | **TBD** (обсуждается отдельно) |
| **Formgrid** | предупреждение | **нет** (в целевой модели) |
| **Emigrant Desk** | информационная подсказка | **нет** |

Этот документ фиксирует impact **только для Desk → info**. Снятие блокировки Formgrid и политика CRM — отдельные решения с дополнительным impact.

---

## Какие файлы потребуется менять

### Обязательные (ядро поведения)

| Файл | Зачем |
|------|-------|
| `src/lib/leads/lead-review-service.ts` | Gate `create_in_crm`: не учитывать Desk в условии 409; пересчитать `hasStrongDuplicate` для очереди |
| `src/lib/leads/lead-review-dedup.ts` | Реклассификация Desk: strong → `infoMatches` / `deskHints`, либо фильтр blocking sources при расчёте флагов |
| `src/lib/leads/lead-review-types.ts` | Новый tier: `infoMatches`, `hasBlockingDuplicate`, `hasDeskHint` (или эквивалент) |
| `src/lib/leads/lead-review-action-errors.ts` | `duplicate_detected_desk` убрать из 409-кодов; оставить тексты для info UI |
| `src/components/leads/LeadReviewDetailView.tsx` | Desk: info-блок (синий/нейтральный), не красный «блокирующий» alert; alert только для blocking sources |
| `src/components/leads/LeadReviewQueueView.tsx` | Бейдж дубликата — только blocking strong (без Desk) |

### Тесты

| Файл | Зачем |
|------|-------|
| `src/lib/leads/lead-review-dedup.integration.test.ts` | Desk strong больше не поднимает `hasStrongMatch` / blocking flag |
| `src/lib/leads/lead-review-action-errors.test.ts` | Убрать/перенести сценарии `duplicate_detected_desk` для 409 |
| `src/lib/leads/desk-dedup.test.ts` | **Без изменений** — логика сопоставления Desk остаётся |

### Вероятно (UX / стили)

| Файл | Зачем |
|------|-------|
| `src/components/leads/LeadReviewQueue.module.css` | Стили `alertInfo` для Desk-подсказки vs `alertStrong` для блокировок |

### Без изменений (ожидаемо)

| Файл / область | Почему |
|----------------|--------|
| `src/lib/leads/desk-dedup.ts` | Алгоритм match остаётся; меняется только **политика** |
| `src/lib/emigrant-desk/*` | Загрузка клиентов Desk нужна для подсказок |
| `src/app/api/crm/leads/[id]/route.ts` | Проксирует `LeadReviewActionError`; меняется только набор кодов 409 |
| Write-path (`appendExternalClientRow`, `CRM_WRITE_*`, ENV) | Вне scope |
| AI Workspace / `client-field-sources` | Desk как источник контекста — не Lead Review gate |

### Документация и аудит-скрипты (при реализации)

| Файл | Зачем |
|------|-------|
| `UX_CHANGE_REPORT.md` | Новые тексты и уровни alert |
| `POST_GO_LIVE_BACKLOG.md` | Согласовать с BL-02 / политикой источников |
| `scripts/post-go-live-audit.mjs` | Метрики: `desk_hint` vs `blocking_409` |

---

## Impact по текущим лидам (post-go-live срез)

Всего лидов: **11** (Formgrid rows 2–12).

### Лиды с Desk strong (9)

| Row | ФИО | CRM strong | Блок 409 сейчас | После demote Desk |
|-----|-----|------------|-----------------|-------------------|
| 3 | Давлятова Лола Бахтиёровна | да | да | **да** (CRM) |
| 4 | Лысогорская Лейсан Ильдусовна | да | да | **да** (CRM) |
| 5 | Смола Александра Сергеевна | да | да | **да** (CRM) |
| 6 | Белкания Автандил Яношевич | нет* | нет (422 phone) | нет (422) |
| 7 | Белоногова Мария Павловна | **нет** | **да** | **нет** ← разблокируется |
| 8 | Куликова Светлана Васильевна | да | да | **да** (CRM) |
| 9 | Бякова Мария Николаевна | да | да | **да** (CRM) |
| 10 | Кулешова Леонелла Евгеньевна | да | да | **да** (CRM) |
| 11 | Тайк Филипп Майерович | **нет** | **да** | **нет** ← разблокируется |

\* Row 6: Desk strong есть, но до 409 не доходит из‑за `phone_invalid` (422).

### Сводка разблокировки (только Desk demote)

| Категория | Кол-во | Rows |
|-----------|--------|------|
| Перестанут получать **409 только из‑за Desk** | **2** | 7, 11 |
| Останутся заблокированы (CRM strong) | **6** | 3, 4, 5, 8, 9, 10 |
| Не в 409 сегодня (validation / status) | 3 | 2 (422), 6 (422), 12 (`created_in_crm`) |

### Formgrid strong в текущем срезе

Отдельных лидов с **только** Formgrid strong (без CRM/Desk) в post-go-live аудите **не зафиксировано**. Если появятся — при целевой политике «Formgrid → warning» разблокируется ещё один класс (не оценён на текущих 11 лидах).

---

## Риски

### Высокие

1. **Дубль CRM для клиента, уже ведущегося в Desk**  
   Row **7** и **11** — реальные совпадения по `case_number` / email с Emigrant Desk. После demote менеджер сможет создать **вторую** запись в Google Sheets CRM, хотя кейс уже в Desk.

2. **Расхождение «операционной правды»**  
   Desk = статус дела, консульство, подача; CRM = воронка Sharp & Spice. Два silo-записи об одном человеке усложняют отчётность и AI-контекст.

3. **Ложное ощущение безопасности**  
   Сигнал Desk strong (case_number = паспорт) сейчас считается надёжным. Перевод в «info» без явного UX («клиент уже в Desk — проверьте перед созданием») повышает риск пропуска.

### Средние

4. **Несогласованность UI и сервера**  
   Если обновить только gate в `lead-review-service`, но оставить красный alert по `hasStrongMatch` в UI — менеджер увидит «дубликат», но create пройдёт (или наоборот). Нужна синхронная смена флагов и стилей.

5. **Метрики и аудит**  
   Post-go-live скрипты и дашборды считают «Desk strong = HIGH risk». После изменения понадобится новая классификация, иначе мониторинг rollout даст ложные тревоги.

6. **Код `duplicate_detected_desk`**  
   Реализован в BL-02 для 409. При demote Desk код станет мёртвым для PATCH или потребует переиспользования только в клиентском info-слое.

### Низкие

7. **Desk medium (ФИО)**  
   Уже не блокирует; impact минимален.

8. **Недоступность Desk API**  
   `listEmigrantDeskClients()` при ошибке возвращает `[]` — подсказки пропадут, create не усилится (fail-open на Desk уже сегодня).

9. **Производительность**  
   Загрузка 88 клиентов Desk на каждый list/detail остаётся; оптимизация не в scope.

---

## Рекомендуемый подход к реализации (концепт)

1. Ввести **`blockingStrongMatches`** = `strongMatches.filter(m => m.source !== 'desk')` (и далее уточнить по политике CRM/Formgrid).
2. Desk strong/medium класть в **`deskHints`** с label «Информация: клиент может быть в Emigrant Desk».
3. HTTP 409 и `hasStrongDuplicate` считать только от **`blockingStrongMatches`**.
4. В UI: Desk — отдельный info-callout со ссылкой на case / email match; красный banner — только blocking.
5. Сохранить `checkLeadAgainstDesk` и тесты — меняется политика, не матчинг.

---

## Зависимости и открытые решения

| Вопрос | Влияние на scope |
|--------|------------------|
| CRM duplicate: block vs warn? | Если **warn** — разблокируется ещё **6** лидов (rows 3,4,5,8,9,10) |
| Formgrid duplicate: только warn | На текущих 11 лидах отдельного эффекта нет; на будущих — да |
| Нужен ли soft-confirm («всё равно создать») при Desk hint? | UX-слой, не меняет серверный gate |
| Скрывать ли `created_in_crm` из очереди? | Orthogonal (BL-04), не связано с Desk |

---

## Итог для принятия решения

- **Минимальный impact (только Desk → info):** **2 лида** (rows 7, 11) перестанут блокироваться; **6** останутся под CRM gate; **9** лидов по-прежнему увидят Desk-подсказку.
- **Основной риск:** создание CRM-записи для человека, уже с case в Emigrant Desk, без жёсткой остановки.
- **Минимальный набор файлов:** 6 исходников + 2–3 теста + стили; write-path и ENV не трогаются.

---

*Анализ подготовлен по коду Lead Review (`lead-review-dedup.ts`, `lead-review-service.ts`, `desk-dedup.ts`) и данным `CRM_WRITE_POST_GO_LIVE_AUDIT.md`.*
