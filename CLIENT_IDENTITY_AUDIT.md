# Аудит клиентской идентификации (подготовка к Unified Client Index)

**Дата:** 2026-06-09  
**Статус:** только диагностика, код не менялся, UCI не внедрялся  
**Данные:** Google Sheets CRM (92 клиента), Formgrid (9 анкет), Emigrant Desk (86 профилей)

---

## Краткий вывод

Система **умеет склеивать только CRM ↔ Formgrid** внутри AI search через `areClientsDuplicates()` / `groupDuplicateClients()`.  
**Emigrant Desk**, **Google Drive (ЭМИГРАНТ)** и **Knowledge Base** с Sheets **не связываются** по идентификатору — только текстовый поиск по запросу.

Главные проблемы для UCI:

1. **Паспорт не матчится CRM ↔ Formgrid** в production-коде (разные ключи `debugRow`).
2. **ФИО — единственный рабочий cross-source ключ**, при этом в CRM часто **только фамилия**, в Formgrid/Desk — **полное ФИО**.
3. **Три разных surrogate ID** без общего `client_id`: `passport` / `ROW-N` (CRM), `rowIndex` (Formgrid), `user_id` (Desk).
4. **Email в Formgrid сейчас пуст** (0 из 9 строк) — поле непригодно как якорь.

---

## ЧАСТЬ 1. Текущие правила сопоставления (merge)

### 1.1. Merge дублей (`areClientsDuplicates`)

**Файл:** `src/lib/ai/client-deduplication.ts`  
**Функция:** `areClientsDuplicates(left, right)`  
**Где вызывается:** `groupDuplicateClients` → `deduplicateToResolved` (search, structured search, fuzzy)

Логика: **достаточно одного совпадения** по любому правилу → записи считаются одним человеком (`isDuplicate: true`). **Весов между правилами нет** — это OR, не scoring.

| Поле | Используется | Условие совпадения | Приоритет (merge) | Файл | Функция |
|------|--------------|-------------------|-------------------|------|---------|
| **Email** | Да | `normalizeEmail(a) === normalizeEmail(b)`, оба непустые | Равный с другими (любой hit → dup) | `client-deduplication.ts` | `areClientsDuplicates` |
| **Телефон** | Да | `normalizePhone`, ≥7 цифр, полное совпадение или последние 10 цифр | Равный | `client-deduplication.ts` | `phonesMatch` |
| **Telegram** | Да | Ключ в `debugRow` содержит `telegram` / `телеграм`, значения равны | Равный | `client-deduplication.ts` | `extractTelegram` |
| **ФИО (фамилия + имя)** | Да | Первые 2 токена имени совпадают (без отчества) | Равный | `client-deduplication.ts` | `fioWithoutPatronymicMatch` |
| **ФИО (partial)** | Да | Частичное совпадение фамилии/имени | Равный | `client-deduplication.ts` | `surnameAndFirstNameMatch` |
| **ФИО (overlap ≥75%)** | Да | Jaccard-подобный overlap токенов имени | Равный | `client-deduplication.ts` | `namesOverlapScore` |
| **ФИО (normalized)** | Да | `buildNormalizedNameParts().normalizedFullName` | Равный | `client-deduplication.ts` + `russian-name-morphology.ts` | `areClientsDuplicates` |
| **Паспорт** | Да* | `debugRow.passport` или `debugRow["номер паспорта"]` — точное совпадение | Равный | `client-deduplication.ts` | `areClientsDuplicates` |
| **Дата рождения** | **Нет** | — | — | — | — |
| **Номер дела (Desk)** | **Нет** | — | — | — | — |
| **case_number (Desk)** | **Нет** в merge | Используется только в UI ответа Desk | — | `workspace-assistant.ts` | `tryDirectEmigrantStatusAnswer` |

\* **Критический дефект:** CRM пишет `debugRow.passport` (`client-context.ts`), Formgrid кладёт паспорт в `debugRow["8. № заграничного паспорта"]` (ключ = заголовок колонки). Код merge **не читает** этот ключ → **паспорт CRM ↔ Formgrid в production не связывается**.

### 1.2. Поиск (scoring, не merge)

**Файл:** `src/lib/ai/client-search.ts` — `scoreClientRecord`  
**Файл:** `src/lib/ai/structured-client-search.ts` — `scoreRecordAgainstIntent`

| Поле | Вес / score (поиск) | Поведение |
|------|---------------------|-----------|
| Телефон (exact) | **100**, early return | `client-search.ts` |
| Email (exact) | **100**, early return | `client-search.ts` |
| ФИО exact / morph | **95–80** | `client-search.ts` |
| Фамилия (lemma) | **68** | `client-search.ts` |
| Заметки | **35** (минимум viable) | `client-search.ts` |
| Паспорт (structured intent) | **+100** | `structured-client-search.ts` |
| Email (structured) | **+95** | `structured-client-search.ts` |
| Телефон (structured) | **+95** | `structured-client-search.ts` |
| Статус (structured) | **+65** | `structured-client-search.ts` |

Пороги: `SCORE_AUTO=80`, `SCORE_STRONG=65`, `SCORE_VIABLE=35`, `SCORE_FUZZY=15`.

**Паспорт в fuzzy search (`scoreClientRecord`) не scoring-ится** — только через structured intent или merge `debugRow`.

### 1.3. Emigrant Desk

**Файл:** `src/lib/emigrant-desk/clients.ts`

| Поле | Использование |
|------|---------------|
| firstName + lastName | `findEmigrantDeskClientByQuery` — token scoring |
| email | Только в haystack для score, **не cross-match с Sheets** |
| case_number | Отображение, **не merge** |

### 1.4. Google Drive (ЭМИГРАНТ / KB)

**Файл:** `src/lib/google-drive/kb-text.ts`

Поиск по **имени файла и тексту документа** (`meaningfulSearchTokens`).  
**Нет** привязки к `client_id`, паспорту или email из CRM.

### 1.5. Правила слияния полей в merged-контексте

**Функция:** `mergeClientContexts` (`client-deduplication.ts`)

| Поле | Приоритет при merge |
|------|---------------------|
| Источник primary | **CRM** (`source === "clients"`), иначе лучший score |
| Имя | **Самое длинное** ФИО (`pickLongestName`) |
| phone, email, manager, … | **Первое непустое** по порядку parts |
| status | CRM, затем Formgrid; конфликт → `conflicts[]` |
| surveyData | Только из Formgrid |
| crmData | Только из CRM |

---

## ЧАСТЬ 2. Реальная статистика (текущие данные)

### 2.1. Объёмы источников

| Источник | Записей | Заполненность ключевых полей |
|----------|---------|------------------------------|
| CRM (Клиенты Хорватия) | **92** | Паспорт: **92/92**; телефон/email в CRM: **пусто** (модель External) |
| Formgrid (Новые клиенты) | **9** | Телефон: **8/9**; паспорт: **9/9**; email: **0/9** |
| Emigrant Desk | **86** | case_number: **86/86**; email есть у профилей |
| ЭМИГРАНТ (Drive) | N файлов | Идентификация не ведётся |

### 2.2. Cross-source (логика `areClientsDuplicates`, production-exact)

Сопоставление **CRM × Formgrid** (92 × 9 пар):

| Категория | Количество |
|-----------|------------|
| Только CRM (нет пары в Formgrid) | **~88** |
| Только Formgrid (нет пары в CRM) | **~5** |
| **Одновременно CRM + Formgrid** (склеиваются search) | **4** клиента |
| Emigrant Desk ↔ Sheets (автоматический merge в коде) | **0** |
| Три и более источника в одном `MergedClientContext` | **0** (только CRM+FG) |

### 2.3. Подтверждённые пары CRM ↔ Formgrid

| CRM (фамилия/краткое ФИО) | Formgrid (полное ФИО) | Причина merge в коде |
|---------------------------|----------------------|----------------------|
| Белкания Автандил | Белкания Автандил Яношевич | фамилия + имя |
| Давлятова Лола | Давлятова Лола Бахтиёровна | фамилия + имя |
| Лысогорская Лейсан | Лысогорская Лейсан Ильдусовна | фамилия + имя |
| Смола Александра | Смола Александра Сергеевна | фамилия + имя |

**Паспорт совпадает у 3 из 4 пар**, но код merge **не использует** паспорт (см. дефект `debugRow`).

### 2.4. Emigrant Desk

- **86** клиентов в Desk, **отдельный** контур данных.
- В коде **нет** функции «найти того же клиента в CRM по Desk».
- Эвристическое совпадение имён CRM↔Desk **не выполнялось в runtime**; вручную видны кейсы вроде Desk «ИРИНА АЛМАСТАНОВА» vs CRM «АЛМАСТАНОВА» — потребуют нормализации «фамилия-only».

---

## ЧАСТЬ 3. Анализ дублей

### 3.1. Дубликаты внутри одного источника

| Ключ | CRM (92) | Formgrid (9) |
|------|----------|--------------|
| Одинаковый паспорт | **0** групп | **0** групп |
| Одинаковое ФИО | **0** групп | **0** групп |
| Одинаковый email | n/a (пусто) | **0** (все пустые) |
| Одинаковый телефон | n/a | **0** |

**Вывод:** явных внутренних дублей в текущей выгрузке нет (малый объём Formgrid).

### 3.2. Подозрительные дубли

| Тип риска | Найдено в данных | Комментарий |
|-----------|------------------|-------------|
| Одно ФИО — разные паспорта | **0** | — |
| Одно ФИО — разные email (FG) | **0** | email пуст |
| FIO-only cross-match без паспорта в коде | **1** пара | Белкания Автандил — только имя |
| Паспорт совпадает, merge не сработал | **3** пары | Дефект ключей `debugRow` |
| CRM «только фамилия» vs полное ФИО | Массово | Риск ложных **negative** (не склеить) и **positive** (склеить однофамильцев) |

### 3.3. Ложные срабатывания / пропуски (оценка)

| Ситуация | Вероятность |
|----------|-------------|
| **False negative:** один человек в CRM и FG, разное написание фамилии | Средняя |
| **False negative:** Desk + CRM, в CRM только фамилия | Высокая |
| **False positive:** однофамильцы с совпадающими именем+фамилией | Низкая при 92 CRM, растёт с масштабом |
| **False positive:** FIO overlap 75% на коротких именах | Средняя |

---

## ЧАСТЬ 4. Merge Accuracy

Оценка **надёжности как идентификатора одного человека** (не только для AI merge, но для UCI):

| Категория | Надёжность | Обоснование |
|-----------|------------|-------------|
| **Паспорт** | **Высокая** (потенциально) | 92/92 в CRM, 9/9 в FG; уникален в данных. **Сейчас не работает cross-merge** из-за ключей `debugRow`. |
| **Телефон** | **Высокая** (где заполнен) | Нормализация + последние 10 цифр. В CRM пусто; в FG 8/9. |
| **Email** | **Высокая** (где заполнен) | Exact match. В FG **0%** заполнения; Desk email **не связан** с Sheets. |
| **Telegram** | **Средняя** | Только если есть в `debugRow` Formgrid. |
| **ФИО** | **Низкая–средняя** | Единственный рабочий cross-source ключ сегодня. CRM = часто **одна фамилия**; морфология помогает в search, но homonyms и транслит — риск. |
| **Дата рождения** | **Не используется** | Поле есть в Formgrid (`4. Дата рождения`), в merge **игнорируется**. |
| **Номер дела (Desk)** | **Не используется** | Нет связи с паспортом CRM. |
| **Файл в Drive** | **Нет** | Только текстовый поиск. |

### Качество текущего merge (CRM ↔ Formgrid)

| Метрика | Оценка |
|---------|--------|
| Precision (из 4 merge — все выглядят корректно) | **~100%** на текущей выборке (n=4) |
| Recall (из ~4 реальных пар с совпадающим паспортом) | **100%** по ФИО, **0%** по паспорту в коде |
| Покрытие Desk / Drive | **0%** |

---

## ЧАСТЬ 5. Готовность к UCI

### Можно ли уже строить единый `client_id`?

**Нет** — не на текущей модели данных и правилах без доработок.

### Почему нет

1. **Нет канонического идентификатора** — три несовместимых surrogate key.
2. **Паспорт не линкуется** между CRM и Formgrid в merge (баг ключей).
3. **CRM не содержит** телефон/email — нельзя подтверждать личность вторым фактором.
4. **Desk и Drive вне графа** идентичности.
5. **ФИО несимметрично** (фамилия vs полное имя) — нужна нормализация persona, не просто string match.
6. **Дата рождения не участвует** — упущенный сильный сигнал для FG.

### Поля, которые **нельзя** использовать как основной `client_id`

| Поле | Причина |
|------|---------|
| **ФИО alone** | Неполное в CRM, омонимия, разные алфавиты |
| **rowIndex / ROW-N** | Локально для таблицы, нестабильно |
| **user_id (Desk)** | Не связан с Sheets |
| **email** (сейчас) | Пуст в Formgrid; не universal |
| **имя файла Drive** | Неструктурировано |
| **case_number** | Только Desk, семантика «дело» ≠ паспорт |

### Поля-кандидаты для **канонического ID** (после исправлений)

| Поле | Роль в UCI |
|------|------------|
| **Номер паспорта** (нормализованный digits) | **Primary anchor**, если исправить парсинг FG + валидация формата |
| **email** | Secondary anchor (когда заполнен в FG) |
| **телефон** | Secondary anchor |
| **дата рождения + фамилия** | Tertiary / disambiguation |
| **Синтетический UUID** | Внутренний `client_id` платформы; anchors = passport, email, phone |

### Рекомендуемые шаги перед UCI (без внедрения UCI сейчас)

1. **Исправить passport bridge:** читать паспорт Formgrid из `getFormgridClientFields().passport` в `debugRow.passport` или расширить `areClientsDuplicates`.
2. **Ввести `normalizePassport(id)`** — единая нормализация для CRM, FG, Desk case_number (если применимо).
3. **Person model:** `surname`, `givenName`, `patronymic`, `latinName` — отдельно от display name.
4. **Зафиксировать правила** strong ID (passport) vs weak ID (FIO) vs manual review queue.
5. **Подключить Desk** через email + fuzzy name + optional case_number map.
6. **Drive:** metadata `client_id` в имени папки/файла или sidecar index (отдельный этап).

### Связь с AI_DATAFLOW_AUDIT.md

Сначала — request-scoped dedup чтений Sheets.  
Параллельно — исправление identity bridge (паспорт).  
Затем — проектирование UCI read-model с каноническим UUID и anchor-таблицей.

---

## Приложение: карта кода идентификации

```
Поиск запроса
  client-search.ts          → score по phone/email/FIO
  structured-client-search  → score по passport/email/phone/status/...
  client-entity-extract.ts  → извлечение ФИО из фразы

Merge (только CRM + Formgrid в одном result set)
  client-deduplication.ts   → areClientsDuplicates, mergeClientContexts
  client-context.ts         → crmClientToContext, formgridRowToContext

Вне merge
  emigrant-desk/clients.ts  → Desk search по имени
  google-drive/kb-text.ts   → Drive search по тексту/имени файла
```

---

*Статистика собрана скриптом аудита по CSV export Google Sheets и Supabase REST Emigrant Desk (2026-06-09). При росте Formgrid и изменении схемы колонок цифры нужно пересчитать.*
