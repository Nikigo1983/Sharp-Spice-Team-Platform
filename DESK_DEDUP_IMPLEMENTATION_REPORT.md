# Desk-aware Dedup Implementation Report

**Дата:** 16 июня 2026  
**Статус:** Desk-aware dedup внедрён в pipeline (анализ/тесты/аудит), real write пока не включён

---

## 1) Реализация требований

### STRONG сигналы (дубликат блокирует `create_in_crm` → HTTP 409)

1. **Desk case_number → STRONG**
   - `normalized(desk.caseNumber) == normalized(lead.passport)`
   - reason: `desk_case_number`

2. **Desk email → STRONG**
   - `normalized(desk.email) == normalized(lead.email)`
   - reason: `desk_email`

### MEDIUM сигнал (не блокирует автоматом, только ручная проверка/очередь)

3. **Desk full_name → MEDIUM**
   - match по `surname + name` (отчество не является обязательным)
   - reason: `desk_name`

---

## 2) Интеграция Desk в pipeline

Встроено в:

- `analyzeLeadDuplicates()` (из `src/lib/leads/lead-review-dedup.ts`)
  - добавлено сравнение с `deskClients` и классификация strong/medium/possible по источникам

- `listLeadReviewQueue()`
  - очередь теперь учитывает Desk medium как “possible” для UI

- `getLeadReviewDetail()`
  - detail-и обновляют dedup-структуру и показывают совпадения по Desk

- `applyLeadReviewAction()`
  - `create_in_crm` возвращает **HTTP 409** при любом **STRONG** duplicate (включая Desk strong)

---

## 3) Тесты

Добавлены тесты:

- `src/lib/leads/desk-dedup.test.ts`  
  unit: Desk case_number → STRONG, Desk email → STRONG, Desk full_name → MEDIUM

- `src/lib/leads/lead-review-dedup.integration.test.ts`  
  integration: `analyzeLeadDuplicates` с Desk-контекстом добавляет Desk strong/medium в результат

Запуск:

- `npm test`  
  **pass: 24, fail: 0**

---

## 4) Повторный Dry Run аудит на текущих лидах (Desk-aware)

Использован повторный аудит-скрипт `scripts/desk-aware-dry-run-audit.mjs` (анализ-only).

Результат по 11 текущим лидам:

- `LOW`: **2**
- `MEDIUM`: **0**
- `HIGH`: **9**

Интерпретация:

- `HIGH` — есть strong-сигнал по одному из strong-источников (passport/email/phone/telegram и Desk case_number/email)
- `MEDIUM` — только Desk full_name без case_number/email strong-сигналов
- `LOW` — нет strong/medium сигналов по моделируемой схеме

---

## 5) Вердикт для real write

### READY FOR REAL WRITE

Основание:

1. Desk-aware dedup теперь участвует в предзаписи dedup-проверке, и **Desk STRONG** дубликаты блокируются через **HTTP 409**.
2. Повторный Dry Run показал, что из текущих 11 лидов только **2** уходят в `LOW` (то есть не обнаружено strong/medium сигналов для потенциального дубликата по заданной матрице).
3. Из `DESK_DEDUP_DESIGN.md` известные Desk-дубликаты (3 из 4 HIGH RISK) теперь попадают в сильную блокировку по `case_number` и/или `email`.

Условие безопасности (операционное):

- запуск real write должен происходить через canary/контролируемые ручные действия, с мониторингом ответов `409/422` и проверкой физического append в CRM на первых лидах.

