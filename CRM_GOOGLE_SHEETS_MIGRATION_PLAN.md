# CRM Google Sheets Migration Plan

**Дата:** 9 июня 2026  
**Объект:** «таблица Клиенты Хорватия.xlsx» → нативная Google Таблица  
**Статус:** только анализ и план. Данные не менялись, код не менялся, миграция не выполнялась.

---

## Executive summary

Сейчас CRM живёт как **Excel (.xlsx) на Google Drive**. Платформа **читает** вкладку **External** через public CSV (`gid=1431336126`). **Google Sheets API v4 не работает** с этим файлом (ошибка: *«document must not be an Office file»*), поэтому **запись Formgrid → CRM заблокирована**.

Цель миграции — получить **нативную Google Таблицу** с тем же содержимым, чтобы:

1. заработал Sheets API (append / update);
2. service account мог писать во вкладку External;
3. не потерять данные и не сломать чтение в production.

**Рекомендация:** сначала **полная резервная копия**, затем **Вариант B** (новая нативная таблица + перенос) **или** конвертация с проверкой, сохранился ли **Spreadsheet ID**. После любой конвертации **обязательно перепроверить `gid` вкладки External** — он почти наверняка изменится.

---

## 1. Где хранится текущий файл

| Параметр | Значение |
|----------|----------|
| **URL (редактирование)** | https://docs.google.com/spreadsheets/d/138W2nHQcJu_xRsI2RBqeD6Oq8Tg9FbKH/edit?gid=1431336126#gid=1431336126 |
| **Spreadsheet / File ID** | `138W2nHQcJu_xRsI2RBqeD6Oq8Tg9FbKH` |
| **Имя файла** | `таблица Клиенты Хорватия.xlsx` |
| **Тип (MIME)** | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (Microsoft Excel, **не** нативная Google Таблица) |
| **Размер** | ~73 KB (~74 819 байт, замер Drive API 09.06.2026) |
| **Владелец** | Уточнить в UI: Google Drive → файл → «Подробности» → «Владелец». В автоматической проверке Drive API не ответил (проблема JWT service account на стороне окружения); на файл у SA ранее была роль **`writer`** (редактор). |
| **Количество вкладок (видимых через public export)** | **2** (см. карту ниже). Полный список имён из `.xlsx` без Drive download не извлечён в этой сессии. |

**Где физически:** Google Drive команды Sharp & Spice (не отдельный Formgrid-файл). Formgrid-анкеты — **другая** таблица: `1S8Y0VCaAQ78wxg5Rxl8fcFMkwSsvr-X-cLrAlK4nF9Q`.

---

## 2. Карта вкладок

Данные получены через **public CSV / gviz** (без изменения файла). Для `.xlsx` Google назначает каждой вкладке свой **`gid`** в URL.

| # | Название (предполож.) | `gid` | Строк данных* | Колонок* | Используется платформой |
|---|------------------------|-------|---------------|----------|------------------------|
| 1 | **External** (основная CRM) | `1431336126` | **93** | **13–14** (A–M + пустая B) | **Да — production** |
| 2 | Рабочая / черновая (точное имя в `.xlsx` — уточнить в UI) | `743043580` | **8** | **8** | **Нет** |

\*Строки = без заголовка; колонки = максимальная ширина непустых ячеек в CSV.

### Заголовки вкладки External (`gid=1431336126`)

```
Фамилия | (пусто) | Номер паспорта | Дата подачи | Дата предполагаемого одобрения |
Имя референта | Адрес букинга | Дата букинга (от и до) | Дата одобрения ВНЖ |
Заметки | Дата выдачи карточки ВНЖ | Пароль для приложения | партнёр от кого клиент
```

Парсер: `parseCroatiaExternalClientsRows` (`src/lib/google-sheets/parse.ts`).

### Вкладка `gid=743043580`

Заголовки CSV: `фамилия`, `пас`, `дата`, … — похоже на **внутренний черновик**, не подключён к коду.

### Notes / Documents / Forms — важно

В `.env.example` и коде есть range'ы:

| Вкладка (ожидание кода) | ENV | Fallback range |
|-------------------------|-----|----------------|
| Clients | `GOOGLE_SHEETS_CLIENTS_RANGE` | `Clients!A1:Z2000` |
| Forms | `GOOGLE_SHEETS_FORMS_RANGE` | `Forms!A1:Z2000` |
| Documents | `GOOGLE_SHEETS_DOCUMENTS_RANGE` | `Documents!A1:Z2000` |
| Notes | `GOOGLE_SHEETS_NOTES_RANGE` | `Notes!A1:E5000` |

**В текущем `.xlsx` эти вкладки не обнаружены** (public export нашёл только 2 `gid`).

**В production сейчас** (если заданы `GOOGLE_SHEETS_SPREADSHEET_ID` + `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID`):

| Функция | Источник |
|---------|----------|
| Список клиентов `/clients`, CRM, AI, аналитика, Lead Review dedup | **External** via public CSV |
| Заметки на карточке клиента | **Supabase / `.data`**, не Google Sheet |
| Анкеты и документы на карточке | **не загружаются** (пустые массивы) |

Логика: `getClientDetail()` при `isGoogleSheetsPublicClientsConfigured()` не вызывает Forms/Documents/Notes из Sheets (`src/lib/google-sheets/service.ts`).

**Вывод:** при миграции критична только вкладка **External**. Notes/Documents/Forms — либо **не переносить** (пока не используются), либо заложить в новую таблицу **на будущее**, если планируется полный CRM в одном файле.

---

## 3. Зависимости платформы

### 3.1. Переменные окружения

| ENV | Назначение |
|-----|------------|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID файла CRM на Drive |
| `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID` | `gid` вкладки External для public CSV |
| `GOOGLE_SHEETS_CLIENTS_RANGE` | Range для Sheets API (сейчас fallback `Clients!` — **не External**) |
| `GOOGLE_SHEETS_NOTES_RANGE` | Sheets API path (не активен в public-режиме) |
| `GOOGLE_SHEETS_DOCUMENTS_RANGE` | то же |
| `GOOGLE_SHEETS_FORMS_RANGE` | то же |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | SA для API (после миграции — запись) |
| `GOOGLE_PRIVATE_KEY` | ключ SA |

**Не путать:** Formgrid использует **отдельные** `GOOGLE_SHEETS_FORMGRID_SPREADSHEET_ID` / `GOOGLE_SHEETS_FORMGRID_GID` — на миграцию CRM **не влияют**.

### 3.2. Файлы кода (прямые ссылки на CRM spreadsheet / gid)

| Файл | Что использует |
|------|----------------|
| `src/lib/google-sheets/google-sheets-client.ts` | `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID`, `GOOGLE_SHEETS_CLIENTS_RANGE`, Notes/Forms/Documents ranges |
| `src/lib/google-sheets/auth.ts` | `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID` |
| `src/lib/google-sheets/parse.ts` | комментарий / парсер External, `gid=1431336126` |
| `src/lib/google-sheets/service.ts` | `getClients()`, деталь клиента, заметки (ветка public vs API) |
| `src/lib/relocation/forms.ts` | **хардкод** `CROATIA_CLIENTS_SHEET_URL`, `CROATIA_CLIENTS_SHEET_ID`, `gid=1431336126` |
| `src/lib/ai/clients-diagnostic.ts` | диагностика CRM env |
| `src/lib/ai/client-lookup.ts` | `listAllClients()` → CRM |
| `src/lib/ai/structured-client-search.ts` | CRM для поиска |
| `src/lib/analytics/croatia.ts` | CRM для аналитики |
| `src/lib/dashboard/stats.ts` | счётчики клиентов |
| `src/lib/leads/lead-review-service.ts` | dedup Formgrid vs CRM |
| `.env.example` | документация env |
| `FORMGRID_TO_CRM_DESIGN.md` | дизайн импорта (ссылки на External) |

### 3.3. Функции продукта, зависящие от CRM

| Раздел | Зависимость |
|--------|-------------|
| **Клиенты** (`/clients`) | public CSV External |
| **AI Workspace** | `listAllClients`, merge с Formgrid, UCI |
| **Аналитика Хорватия** | `listAllClients` |
| **Dashboard** | счётчик клиентов |
| **Новые лиды** (`/crm/leads`) | dedup по CRM (read-only) |
| **Эмиграция** | ссылка на таблицу (хардкод URL) |
| **Запись в CRM** (будущая) | Sheets API append — **сейчас не работает** |

---

## 4. План миграции: два варианта

### Вариант A — Конвертация текущего `.xlsx`

**Суть:** открыть файл в Google Таблицах и сохранить/конвертировать в нативный формат Google Sheet (через UI Drive или «Открыть с помощью → Google Таблицы» → «Файл → Сохранить как Google Таблицу»).

| | |
|--|--|
| **Плюсы** | Меньше ручного копирования; можно сохранить привычное имя; иногда **тот же File ID** (нужно проверить после операции). |
| **Риски** | • Форматы дат/чисел могут сдвинуться (паспорта как числа).<br>• **`gid` вкладок почти наверняка изменится** после конвертации.<br>• Формулы Excel могут сломаться.<br>• Если создаётся **новый** файл вместо замены — старые ссылки и ENV останутся на `.xlsx`.<br>• Возможен downtime 15–60 мин, пока не обновят env/ссылки. |
| **Время** | ~30–90 мин (конвертация + сверка 93 строк + обновление env + деплой). |
| **Влияние на платформу** | После конвертации: public CSV **может** работать с новым `gid`; Sheets API **начнёт** работать; нужно выставить `GOOGLE_SHEETS_CLIENTS_RANGE=External!A:M` (или фактическое имя листа). |

### Вариант B — Новая Google Таблица + перенос данных

**Суть:** создать **новую** нативную Google Таблицу → импортировать/скопировать вкладки из `.xlsx` → проверить → переключить ENV на новый ID → старый `.xlsx` оставить архивом (read-only).

| | |
|--|--|
| **Плюсы** | **Безопасный откат** (старый файл не трогаем); чистая структура; явный cutover; проще назвать листы `External`, `Notes`, … по стандарту кода. |
| **Риски** | • **Новый Spreadsheet ID** — обязательно менять ENV и хардкод в `relocation/forms.ts`.<br>• Ручной перенос 2+ вкладок — риск пропустить строку.<br>• Нужно заново расшарить файл на service account (Editor).<br>• Закладки/ссылки у команды в браузере устареют. |
| **Время** | ~1.5–3 ч (создание, импорт, сверка, env, деплой, smoke tests). |
| **Влияние на платформу** | Пока ENV не обновлён — production читает **старый** `.xlsx`. После переключения — всё читает **новый** ID + новый `gid`. |

### Сравнение

| Критерий | Вариант A | Вариант B |
|----------|-----------|-----------|
| Безопасность данных | Средняя (меняем оригинал) | **Высокая** (оригинал = архив) |
| Откат | Сложнее | **Проще** (вернуть старый ENV) |
| Смена Spreadsheet ID | Может не понадобиться | **Обязательно** |
| Смена `gid` External | **Вероятно да** | **Вероятно да** |
| Рекомендация | Если команда уверена в конвертации и проверит ID/gid сразу | **Предпочтительно для production** |

---

## 5. Сохранность ссылок и ENV после миграции

### Изменится ли Spreadsheet ID?

| Сценарий | Spreadsheet ID |
|----------|----------------|
| Конвертация **на месте** (тот же файл в Drive, сменился только MIME) | **Не изменится** `138W2nHQcJu_xRsI2RBqeD6Oq8Tg9FbKH` |
| «Сохранить как Google Таблицу» → **новый** файл | **Изменится** — нужен новый ID |
| Вариант B (новая таблица) | **Изменится** |

### Изменится ли `gid` вкладки External?

**С высокой вероятностью — да.**  
`1431336126` — идентификатор листа внутри **Excel** в Google Drive. После конвертации в нативную Google Таблицу Google назначает **новые** numeric `gid`.

**Действие:** после миграции открыть таблицу → вкладка External → скопировать `gid` из URL → обновить env.

### Какие ENV заменить

| ENV | Когда менять | Новое значение |
|-----|--------------|----------------|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Если новый файл (Вариант B или новый файл в A) | ID из URL `/d/{ID}/edit` |
| `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID` | **Почти всегда после миграции** | `gid` вкладки External из URL |
| `GOOGLE_SHEETS_CLIENTS_RANGE` | Перед включением записи | `External!A:M` (или `External!A1:M2000`) |
| `GOOGLE_SHEETS_NOTES_RANGE` | Только если переносите Notes | `Notes!A1:E5000` |
| `GOOGLE_SHEETS_DOCUMENTS_RANGE` | Только если переносите Documents | `Documents!A1:Z2000` |
| `GOOGLE_SHEETS_FORMS_RANGE` | Только если переносите Forms | `Forms!A1:Z2000` |

**Не менять** для CRM-миграции: `GOOGLE_SHEETS_FORMGRID_*`, `GOOGLE_DRIVE_*`, Supabase keys.

### Хардкод в репозитории (после миграции — отдельный PR)

- `src/lib/relocation/forms.ts` — `CROATIA_CLIENTS_SHEET_URL` (ID + gid)
- Опционально: вынести URL в env, чтобы не деплоить при смене ссылки

### Что перестанет работать до обновления ENV

| Сервис | Симптом |
|--------|---------|
| **/clients** | Пустой список или старые данные (.xlsx), если env указывает на несуществующий gid |
| **AI Workspace** (контекст CRM) | Нет клиентов / устаревший снимок |
| **Аналитика Хорватия** | Нулевые или неверные метрики |
| **Lead Review dedup** | Ложные «новые» лиды (CRM пустой) |
| **Sheets API append** (будущее) | 400 / NOT_FOUND до исправления ID, range и прав SA |
| **Ссылка «Клиенты Хорватия» в Эмиграции** | Ведёт на старый URL (если не обновить код) |

**Не затронуто:** Formgrid, team chat, tasks, Supabase-заметки клиентов.

---

## 6. Пошаговый чеклист миграции

### Шаг 1 — Создать копию

- [ ] В Google Drive: ПКМ по `таблица Клиенты Хорватия.xlsx` → **Создать копию**
- [ ] Имя копии: `Клиенты Хорватия — BACKUP 2026-06-09.xlsx`
- [ ] Убедиться, что копия открывается и на вкладке External **93 строки** клиентов
- [ ] Сохранить ссылку на backup в внутреннем документе команды
- [ ] (Опционально) Скачать `.xlsx` локально как второй backup

### Шаг 2 — Конвертировать / создать нативную таблицу

**Вариант B (рекомендуется):**

- [ ] Создать **новую** Google Таблицу: `Клиенты Хорватия (Google Sheets)`
- [ ] Импорт: Файл → Импорт → загрузить backup `.xlsx` → «Заменить таблицу» / отдельные листы
- [ ] Переименовать лист с клиентами в **`External`** (если имя другое)
- [ ] Перенести вторую вкладку (`gid 743043580`) или оставить в архиве — **на платформу не влияет**
- [ ] Поделиться таблицей: service account → роль **Редактор**
- [ ] Записать **новый Spreadsheet ID** и **новый gid** External из URL

**Вариант A (альтернатива):**

- [ ] Открыть оригинал через Google Таблицы
- [ ] Конвертировать в нативный формат по инструкции Google (без удаления backup)
- [ ] Проверить: изменился ли **File ID** в URL
- [ ] Записать **актуальный gid** External

### Шаг 3 — Проверить чтение CRM

- [ ] Public CSV вручную:  
  `https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={GID}`
- [ ] Первая строка = заголовки External (Фамилия, Номер паспорта, …)
- [ ] ~93 строки данных, паспорта читаемы как текст (не научная нотация)
- [ ] Обновить в **Vercel** (staging или preview):  
  `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID`
- [ ] Открыть `/clients` — список совпадает с таблицей
- [ ] Сверить 3–5 клиентов по паспорту и фамилии

### Шаг 4 — Проверить AI Workspace

- [ ] Открыть AI Workspace → выбрать клиента из CRM
- [ ] Убедиться, что CLIENT CONTEXT показывает поля External (паспорт, заметки, статус)
- [ ] Запустить `/api/ai-workspace/clients-diagnostic` (или экран диагностики) — CRM source = ok, count ~93
- [ ] Поиск по фамилии / паспорту находит того же клиента, что в таблице

### Шаг 5 — Проверить Lead Review Queue

- [ ] Открыть `/crm/leads`
- [ ] Для лида с известным паспортом (Давлятова / Лысогорская / Смола) — **strong duplicate** к CRM
- [ ] Для тестового уникального лида — нет ложного strong match
- [ ] Кнопка «Создать в CRM» по-прежнему **не пишет** в Sheets (ожидаемо до фазы записи)

### Шаг 6 — Включить запись (отдельная фаза, после миграции)

**Не делать в день миграции данных без отдельного теста.**

- [ ] Убедиться: `spreadsheets.get` по новому ID возвращает листы (не 400 Office file)
- [ ] Выставить `GOOGLE_SHEETS_CLIENTS_RANGE=External!A:M`
- [ ] Тестовый append одной строки в конец (отдельная тест-строка) → удалить вручную
- [ ] Реализовать/включить `appendExternalClientRow` + Lead Review `create_in_crm` (код — отдельный PR)
- [ ] Повторить readiness report из `FORMGRID_TO_CRM_DESIGN.md`

---

## 7. Критерии успешной миграции (Definition of Done)

- [ ] Нативная Google Таблица, MIME `application/vnd.google-apps.spreadsheet`
- [ ] Sheets API `spreadsheets.get` — **200 OK**
- [ ] Service account — **Editor** на файл
- [ ] Public CSV External — **93±** клиентов, парсер без регрессий
- [ ] Production ENV обновлён (ID + gid + при необходимости range)
- [ ] Backup `.xlsx` сохранён и не используется production
- [ ] Ссылка в разделе «Эмиграция» ведёт на новую таблицу (после PR)
- [ ] Запись Formgrid → CRM **не включена**, пока не пройден отдельный readiness checklist

---

## 8. Риски и митигация

| Риск | Митигация |
|------|-----------|
| Потеря строк при импорте | Сверка количества строк + выборочно 10 паспортов |
| Паспорт `765946434` → `7.66E+08` | Формат колонки «Текст» в External до импорта |
| Старый gid в env | Явно скопировать gid из URL после миграции |
| Downtime на Vercel | Сначала preview deployment с новыми env |
| Команда пользуется старой ссылкой | Обновить закладки + карточку Эмиграция |
| Запись включили рано | Шаг 6 только после API smoke test |

---

## 9. Связанные документы

- `FORMGRID_TO_CRM_DESIGN.md` — дизайн импорта и блокер Office file
- CRM Import Readiness Report (чат 09.06.2026) — вердикт **НЕ ГОТОВО** к записи до миграции

---

## 10. Следующие действия (для команды)

1. Выбрать **Вариант A или B** (рекомендация: **B**).
2. Назначить ответственного за backup и сверку строк.
3. Выполнить шаги 1–5 чеклиста в **preview** окружении Vercel.
4. После успеха — production ENV + мониторинг `/clients` 24 ч.
5. Отдельной задачей — код записи в CRM и обновление `relocation/forms.ts`.

*Документ подготовлен автоматически по состоянию репозитория и public-проб файла CRM. Owner и точные имена листов внутри `.xlsx` уточните визуально в Google Drive перед cutover.*
