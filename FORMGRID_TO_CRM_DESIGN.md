# Проектирование автоматической конвертации Formgrid → CRM

**Дата:** 12 июня 2026  
**Статус:** только проектирование, код не менялся  
**Контекст:** Formgrid **~62** анкет, CRM **~92** клиента; **~54–59** лидов Formgrid не имеют строки в CRM (оценка по lifecycle-аудиту)

---

## Краткий вывод

Автоконвертация **технически возможна**, но упирается в три ограничения:

1. **CRM в production — read-only public CSV** (вкладка External); запись в таблицу сейчас не реализована для этого режима.
2. **Схема CRM External не совпадает с Formgrid**: в CRM хранится **фамилия**, а не полное ФИО; **телефон и email в CRM не заполняются** (жёстко `—` в парсере).
3. **Дедуп уже надёжен по паспорту** (`client-passport.ts`, `client-deduplication.ts`) — его нужно вызывать **до** создания строки, а не после.

**Рекомендуемая стратегия:** вариант **C + элементы B** — создание CRM-строки только после проверки дублей (passport / phone / email / telegram), с опциональным подтверждением менеджером для weak-match (FIO-only).

---

## ЧАСТЬ 1. Анализ данных Formgrid

### 1.1. Источник и объём

| Параметр | Значение |
|----------|----------|
| Таблица | Google Sheets, `GOOGLE_SHEETS_FORMGRID_SPREADSHEET_ID` + `GOOGLE_SHEETS_FORMGRID_GID` (по умолчанию gid `0`) |
| Загрузка | `getFormgridLeadsTable()` → public CSV (`formgrid-leads.ts`) |
| Записей | **~62** (публичная выгрузка, 12.06.2026) |
| Surrogate ID | `rowIndex` (номер строки листа) |
| Статус в платформе | `Новая заявка` (`FORMGRID_LEAD_STATUS`) |

### 1.2. Поля Formgrid (структура анкеты)

Платформа извлекает поля через `getFormgridClientFields()` (`formgrid-lookup.ts`) по заголовкам колонок. Полный `debugRow` сохраняет **все непустые колонки** строки (`formgridRowToContext`).

#### Ядро (используется в коде)

| Поле (логическое) | Поиск колонки | Обязательность в анкете | Заполненность* |
|-------------------|---------------|------------------------|----------------|
| **ФИО (кириллица)** | `1. Фамилия, Имя, Отчество…` / `/фамилия.*имя/i` | Фактически да (имя по умолчанию = col 0) | ~62/62 |
| **ФИО (латиница)** | `2. ФИО (латинскими)` | Рекомендуется анкетой | высокая |
| **№ загранпаспорта** | `8. № заграничного паспорта` / `/загран\|passport/i` | Да для merge/UCI | **9/9** (аудит 09.06); при 62 строках — пересчитать |
| **Телефон** | `/телефон\|phone/i` | Да | **8/9** → ожидается высокая |
| **Email** | `/email\|почта/i` | Опционально | **0/9** в старом срезе; может вырасти |
| **Дата рождения** | `/дата рождения\|birth/i` | Опционально | есть в схеме |
| **Дата подачи** | `Submitted At` / `/timestamp\|submitted/i` | Авто | есть |

\*Старый срез 9 строк; при 62 анкетах fill-rate нужно обновить перед внедрением.

#### Дополнительные колонки анкеты

Все остальные ответы Formgrid (гражданство, город, семейное положение, доход, Telegram и т.д.) доступны в `debugRow` по заголовку, но **не нормализованы** в `FormgridClientFields`. Для конвертации их можно:

- положить в **заметки CRM** (`notes`), или
- хранить в **platform-side link table** (`formgrid_row_index → crm_passport_id`).

### 1.3. Поля, необходимые для создания клиента в CRM

Для вкладки **Клиенты Хорватия (External)** парсер требует (`parseCroatiaExternalClientsRows`):

```
if (!family && !passport) → строка отбрасывается
```

| Минимум для CRM | Источник в Formgrid | Комментарий |
|-----------------|---------------------|-------------|
| **Фамилия** (`family`) | Первый токен из `fields.name` | CRM не хранит полное ФИО |
| **Паспорт** (`passport`) | `fields.passport` | Становится `client.id` |
| Желательно | `submittedAt` | → колонка «дата подачи» |
| Желательно | `fields.name` (латиница) | → `citizenship` / familyLatin |

Телефон и email **нужны для UCI и дедупа**, но **не имеют колонок** в текущей CRM External.

---

## ЧАСТЬ 2. Анализ CRM

### 2.1. Режим production: External tab (public CSV)

Парсер: `parseCroatiaExternalClientsRows` (`parse.ts`, gid из `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID`).

| Колонка CRM (External) | Поле `Client` | Обязательность |
|------------------------|---------------|----------------|
| Фамилия | `name` | **Да** (или паспорт) |
| ФИО латиницей | `citizenship` | Нет |
| Номер паспорта | `passportNumber`, `id` | **Да** (или фамилия) |
| Дата подачи | `submittedAt`, `createdAt` | Нет |
| Дата предполагаемого одобрения | `expectedApprovalAt` | Нет |
| Имя референта | `manager`, `referentName` | Нет |
| Адрес букинга | `bookingAddress` | Нет |
| Дата букинга | `bookingRange` | Нет |
| Дата одобрения ВНЖ | `approvalAt` | Нет |
| Заметки | `notes` | Нет |
| Дата выдачи карточки ВНЖ | `residenceCardIssuedAt` | Нет |
| Пароль для приложения | `appPassword` | Нет |
| Партнёр | (в row) | Нет |

**Жёстко пустые в External-режиме** (не читаются из CSV):

- `phone` → всегда `—`
- `email` → всегда `—`
- `status` → **выводится** из `notes` + `approvalAt` (`deriveCroatiaExternalStatus`)

### 2.2. Что можно заполнить автоматически из Formgrid

| CRM поле | Автозаполнение | Источник Formgrid |
|----------|----------------|-------------------|
| `passportNumber` / `id` | ✅ | `8. № заграничного паспорта` (нормализовать) |
| `name` (фамилия) | ✅ | Первое слово `fields.name` |
| `citizenship` | ✅ | `2. ФИО (латинскими)` или отдельная колонка |
| `submittedAt` / `createdAt` | ✅ | `Submitted At` |
| `notes` (начальные) | ✅ | Сводка: телефон, email, полное ФИО, дата рождения, ссылка на rowIndex |
| `direction` / `country` | ✅ | Константа `Хорватия` |
| `status` | ⚠️ | Выведется как `Статус не указан` пока нет заметок об этапе |

### 2.3. Что остаётся пустым до работы менеджера

| Поле | Кто заполняет |
|------|----------------|
| `referent` / менеджер | Менеджер при назначении |
| `bookingAddress`, `bookingRange` | Менеджер / операционка |
| `expectedApprovalAt`, `approvalAt` | По ходу кейса |
| `notes` (операционные) | Менеджер |
| `residenceCardIssuedAt`, `appPassword` | После одобрения |
| Статус «В работе» / «Консультация» | Через содержание `notes` или ручное обновление |

### 2.4. Ограничение записи в CRM

| Режим | Чтение | Запись новой строки клиента |
|-------|--------|----------------------------|
| **Public CSV (production)** | ✅ `fetchPublicClientsCsv` | ❌ Нет API в коде |
| **Service account + `Clients!A1:Z`** | ✅ `getClientsRows` | ⚠️ `appendRow` есть, но **не используется для клиентов**; только Notes |

**Вывод:** перед автоконвертацией нужен **новый write-path**: Sheets API `append` на вкладку External **или** service account с правами на CRM spreadsheet.

---

## ЧАСТЬ 3. Mapping Formgrid → CRM

### 3.1. Основная таблица соответствий

| Formgrid (колонка / поле) | Трансформация | CRM (External колонка) | Поле `Client` | Примечание |
|-----------------------------|---------------|----------------------|---------------|------------|
| `1. Фамилия, Имя, Отчество` | `extractSurname(fullName)` | Фамилия | `name` | В CRM — **только фамилия** |
| `1. Фамилия, Имя, Отчество` | полная строка | — | — | В `notes`: «ФИО: …» |
| `2. ФИО (латинскими)` | as-is | ФИО латиницей | `citizenship` | |
| `8. № заграничного паспорта` | `normalizePassport()` | Номер паспорта | `passportNumber`, `id` | Primary key CRM |
| `Submitted At` / timestamp | `toLocaleDateString` | Дата подачи | `submittedAt` | |
| Телефон | as-is | — | — | Только в `notes` или новая колонка |
| Email | as-is | — | — | Только в `notes` или новая колонка |
| `4. Дата рождения` | as-is | — | — | В `notes`; для UCI — anchor |
| Telegram (если есть колонка) | as-is | — | — | Дедуп + `notes` |
| `rowIndex` Formgrid | `FG-{rowIndex}` | — | — | В `notes` / platform link table |
| — | константа | — | `direction` = Хорватия | |
| — | шаблон | Заметки | `notes` | «Лид из Formgrid {date}. Контакты: …» |

### 3.2. Пример начальной заметки CRM

```
[Formgrid auto-import row 45, 2026-06-12]
ФИО: Давлятова Лола Бахтиёровна
Телефон: +79099550114
Email: (не указан)
Дата рождения: 14.09.1990
Источник: анкета Formgrid
```

### 3.3. Расширение схемы CRM (опционально, фаза 2)

Если команда готова менять таблицу External:

| Новая колонка CRM | Formgrid |
|-------------------|----------|
| `Телефон` | Телефон |
| `Email` | Email |
| `Formgrid Row ID` | `rowIndex` |
| `Полное ФИО` | `1. Фамилия, Имя, Отчество` |

Это упростит UCI и уберёт дублирование контактов в `notes`.

---

## ЧАСТЬ 4. Правила создания клиента

### Вариант A — Сразу после анкеты

**Триггер:** новая строка в Formgrid (тот же механизм, что `formgrid-watch.ts` → `notifyNewClient`).

| Плюсы | Минусы |
|-------|--------|
| Нет потерянных лидов | Риск дублей при повторной анкете |
| Минимальная задержка | CRM засоряется нецелевыми лидами |
| Простая автоматизация | Менеджер не отфильтровал спам/тест |
| Хорошо для UCI (всегда есть CRM anchor) | Конфликт если клиент уже в CRM под другой фамилией |

### Вариант B — После подтверждения менеджером

**Триггер:** кнопка «Принять в CRM» в UI (`NewFormgridClientsList` / уведомление).

| Плюсы | Минусы |
|-------|--------|
| Контроль качества | Задержка, человеческий фактор |
| Меньше мусора в CRM | Лиды без действия остаются только в Formgrid |
| Менеджер видит анкету целиком | Не решает рассинхрон без дисциплины |
| Подходит для консультационных лидов | UCI откладывается до ручного шага |

### Вариант C — После проверки дублей (рекомендуется как ядро)

**Триггер:** новая строка Formgrid → pipeline:

1. Извлечь passport / phone / email / telegram.
2. Загрузить CRM + существующие FG (`listAllClients` + `getFormgridLeadsTable`).
3. `areClientsDuplicates(fgCtx, crmCtx)` для каждого CRM.
4. **Если strong match** → не создавать; записать `source_link` (FG row → existing CRM id).
5. **Если нет match** → создать CRM строку.
6. **Если `isPossibleDuplicate`** (FIO-only) → очередь manual review (вариант B).

| Плюсы | Минусы |
|-------|--------|
| Использует уже внедрённый passport merge | Сложнее pipeline |
| Нет дублей по паспорту/телефону | FIO-only всё ещё требует человека |
| Совместимо с UCI | Нужен state store (что уже сконвертировано) |
| Можно комбинировать с уведомлением | Первая реализация — больше кода |

### Рекомендация

```
Formgrid new row
    → dedup (C)
        → strong duplicate? → link only, notify «клиент уже в CRM»
        → possible duplicate? → queue for manager (B)
        → clean? → auto-create CRM (A) + notify manager
```

**Точка интеграции в текущий код:** расширить `processFormgridLeadsForNotifications` (`formgrid-watch.ts`) или добавить параллельный `formgrid-to-crm-watch` с отдельным ключом в `app_state` (`formgrid_crm_converted_rows`).

---

## ЧАСТЬ 5. Защита от дублей

### 5.1. Текущие strong-ключи (`areClientsDuplicates`)

| Ключ | Условие | Действие при конвертации |
|------|---------|--------------------------|
| **passport** | `passportsMatch()` после `normalizePassport` | **Не создавать** CRM; `link(formgrid_row, crm_id)` |
| **email** | normalize, оба непустые | **Не создавать** |
| **phone** | ≥7 цифр, full или last-10 | **Не создавать** |
| **telegram** | ключ в `debugRow` | **Не создавать** |

### 5.2. Weak-ключи (не блокируют автосоздание)

| Ключ | Поведение |
|------|-----------|
| FIO partial / overlap ≥75% | `isPossibleDuplicate` → **manual review**, не auto-create |
| Разные паспорта при обоих заполненных | FIO-match **блокируется** (`passportsDiffer`) |

### 5.3. Алгоритм «избежать повторного создания»

```
function shouldCreateCrmFromFormgrid(fgRow):
  fgCtx = formgridRowToContext(headers, fgRow, rowIndex)

  if alreadyConverted(fgRow.rowKey): return SKIP_ALREADY_DONE

  for crmClient in listAllClients():
    crmCtx = crmClientToContext(crmClient)
    check = areClientsDuplicates(fgCtx, crmCtx)
    if check.isDuplicate:
      markLinked(fgRow, crmClient.id, check.reasons)
      return SKIP_DUPLICATE

  if anyPossibleDuplicate(fgCtx, allCrmAndFg):
    enqueueManualReview(fgRow)
    return PENDING_REVIEW

  if !normalizePassport(fgCtx) && !extractSurname(fgCtx.name):
    enqueueManualReview(fgRow)  // нет минимальных данных
    return PENDING_DATA

  return CREATE
```

### 5.4. Идемпотентность

| Механизм | Назначение |
|----------|------------|
| `buildRowKey()` (как в `formgrid-watch`) | Детект **новой** анкеты |
| `formgrid_crm_links` в `app_state` / Supabase | `rowKey → crm_passport_id, converted_at` |
| Паспорт как CRM `id` | Повторный import с тем же паспортом не создаст вторую строку |

### 5.5. Краевые случаи

| Ситуация | Решение |
|----------|---------|
| Повторная анкета того же человека (новый row, тот же паспорт) | Link, не create |
| Анкета без паспорта, но с телефоном | Create если phone unique; иначе review |
| CRM клиент создан вручную до анкеты | passport match → link задним числом |
| Белкания (FIO-only, пустой паспорт в debug) | Manual review (текущее поведение dedup) |

---

## ЧАСТЬ 6. Влияние на Unified Client Index

### 6.1. Текущее состояние (без автоконвертации)

| Метрика | Значение |
|---------|----------|
| Formgrid-only (нет CRM) | **~54–59** из 62 |
| CRM + Formgrid merged | **~3–8** |
| CRM-only | **~84–89** |
| Разрозненные «лиды без CRM» | **~87–95%** Formgrid |

Каждый Formgrid-only лид — **отдельная сущность** в UCI без `crm_anchor`.

### 6.2. Ожидаемый эффект после автоконвертации

При стратегии **C + auto-create для clean leads**:

| Метрика | До | После (оценка) |
|---------|-----|----------------|
| Formgrid-only | ~54–59 | **~0–5** (спам, no passport, pending review) |
| CRM с известным FG row | ~3–8 | **~57–62** (все принятые лиды) |
| Дубли CRM при новых анкетах | возможны | **~0** (passport guard) |
| Strong anchors для UCI | паспорт в 2 системах вручную | **паспорт + link table** автоматически |

**Сокращение разрозненных клиентов:** примерно **50–57 записей** (−**85–95%** FG-only), что критично для UCI read-model.

### 6.3. Что даст UCI

| Компонент | Роль |
|-----------|------|
| `client_id` (UUID) | Внутренний канон |
| `anchor: passport_norm` | Из CRM `id` после конвертации |
| `source_links.formgrid_row` | Обратная связь |
| `source_links.crm_passport` | Прямая связь |
| `lifecycle_stage` | `Lead` → `Qualified` при появлении CRM строки |

Автоконвертация **не заменяет UCI**, но убирает главный пробел: **отсутствие CRM-якоря у большинства лидов**.

### 6.4. Остаточные разрывы после внедрения

| Разрыв | Решение (следующий этап) |
|--------|--------------------------|
| Desk без CRM | Desk linking по email + name |
| Контакты только в `notes` | Колонки phone/email в CRM |
| Drive без `client_id` | Именование папок / индекс файлов |
| Исторические 54 FG без CRM | Одноразовый backfill job |

---

## Архитектура (предлагаемая, без реализации)

```
┌─────────────────┐     new row      ┌──────────────────────┐
│ Formgrid Sheet  │ ───────────────► │ formgrid-watch       │
└─────────────────┘                  │ (+ crm converter)    │
                                     └──────────┬───────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    ▼                           ▼                           ▼
           ┌────────────────┐        ┌─────────────────┐        ┌──────────────────┐
           │ dedup engine   │        │ app_state links │        │ Sheets API append │
           │ (existing)     │        │ fg_row → crm_id │        │ External tab      │
           └────────────────┘        └─────────────────┘        └──────────────────┘
                    │                           │                           │
                    └───────────────────────────┴───────────────────────────┘
                                                ▼
                                     ┌──────────────────────┐
                                     │ CRM (Клиенты)        │
                                     │ + уведомление менеджеру│
                                     └──────────────────────┘
```

### Новые сущности (platform-side)

| Сущность | Поля |
|----------|------|
| `formgrid_crm_conversions` | `formgrid_row_key`, `formgrid_row_index`, `crm_client_id`, `match_reason`, `status` (created / linked / pending_review), `created_at` |

### Зависимости реализации

1. Service account с **write** на CRM spreadsheet (или смена архитектуры хранения).
2. Решение по хранению phone/email (notes vs новые колонки).
3. Backfill для **~54–59** исторических FG-only.
4. UI: статус конвертации в «Новые клиенты Formgrid» + очередь possible duplicates.

---

## План внедрения (фазы)

| Фаза | Содержание | Риск |
|------|------------|------|
| **0** | Readiness: write API, fill-rate audit на 62 строках | Низкий |
| **1** | Dedup + link only (без create), метрики | Низкий |
| **2** | Auto-create для clean leads + notifications | Средний |
| **3** | Manual review UI для `isPossibleDuplicate` | Средний |
| **4** | Backfill исторических анкет | Средний |
| **5** | UCI `source_links` на базе conversions table | Высокий (UCI) |

---

## Связанные документы

- `CLIENT_IDENTITY_AUDIT.md` — merge rules, статистика идентичности
- `CLIENT_LIFECYCLE_AUDIT.md` (отчёт в чате, 12.06.2026) — сценарии FG→CRM→Desk
- Код: `formgrid-lookup.ts`, `parse.ts`, `client-deduplication.ts`, `client-passport.ts`, `formgrid-watch.ts`

---

*Документ подготовлен по коду платформы без изменений в репозитории (кроме этого файла проектирования).*
