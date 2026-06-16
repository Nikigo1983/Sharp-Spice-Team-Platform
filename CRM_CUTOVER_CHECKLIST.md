# CRM Cutover Checklist

**Дата:** 16 июня 2026  
**Режим:** только план переключения, без изменений кода/данных  
**Контекст:** текущая CRM читается из `.xlsx`; активный лист `gid=1431336126`, имя листа в UI — `В Работе`.

---

## 1) Какие ENV изменяются после создания новой Google Sheet

После создания новой таблицы и выбора листа-источника:

- `GOOGLE_SHEETS_SPREADSHEET_ID` → **новый ID** новой Google Sheet.
- `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID` → **новый gid** листа CRM в новой таблице.
- `GOOGLE_SHEETS_CLIENTS_RANGE` → целевой range листа CRM для API-path:
  - рекомендуется: `'В Работе'!A:M` (или фактическое имя листа + `!A:M`).

Опционально (если реально используются соответствующие вкладки в новой таблице):

- `GOOGLE_SHEETS_FORMS_RANGE`
- `GOOGLE_SHEETS_DOCUMENTS_RANGE`
- `GOOGLE_SHEETS_NOTES_RANGE`

---

## 2) Какие ENV остаются без изменений

- `GOOGLE_SHEETS_FORMGRID_SPREADSHEET_ID`
- `GOOGLE_SHEETS_FORMGRID_GID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEETS_CACHE_TTL_MS` (если не хотите менять TTL)
- `EMIGRANT_SUPABASE_URL`
- `EMIGRANT_SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_DRIVE_*`

---

## 3) Какие части платформы используют CRM сейчас

## Ключевые потребители CRM

- **Клиенты (`/clients`)**  
  Основной список и карточка клиента.

- **AI Workspace**  
  Контекст клиентов, поиск по CRM-данным, объединение с Formgrid/Desk.

- **Lead Review Queue (`/crm/leads`)**  
  Dedup Formgrid-лидов против текущих CRM клиентов.

- **Analytics (Хорватия)**  
  Метрики submitted/approved/active по CRM данным.

- **Dashboard stats**  
  `clientsTotal`, активные консультации и связанные вычисления.

- **Поиск/lookup в AI-модулях**  
  `client-lookup`, `structured-client-search`, контекстные подсказки.

---

## 4) Что проверить сразу после переключения

## Smoke checks (сразу после обновления ENV)

1. **Список клиентов**
   - `/clients` открывается.
   - Количество клиентов соответствует ожидаемому (по новой таблице).
   - 5 контрольных клиентов совпадают по паспорту/фамилии.

2. **Поиск клиентов**
   - Поиск по фамилии и по паспорту находит те же записи.

3. **AI Workspace**
   - Видит CRM-контекст.
   - Отдаёт данные по контрольным клиентам без пустых/сбитых полей.

4. **Dedup**
   - Для известных кейсов (например Давлятова/Лысогорская/Смола) сохраняется ожидаемое совпадение.

5. **Lead Review Queue**
   - Очередь открывается.
   - Strong/possible duplicate рассчитываются корректно.

6. **Analytics/Dashboard**
   - Метрики не обнулились.
   - Нет резких аномалий из-за пустого CRM источника.

---

## 5) Пошаговый Cutover Checklist (от новой таблицы до Go-Live)

## Фаза A — Подготовка новой таблицы

- [ ] Создать новую native Google Sheet.
- [ ] Перенести данные CRM листа (`В Работе`) из текущего `.xlsx`.
- [ ] Убедиться, что паспортная колонка в формате текста.
- [ ] Проверить структуру A:M и заголовки.
- [ ] Зафиксировать:
  - [ ] новый `Spreadsheet ID`
  - [ ] новый `gid` листа CRM
  - [ ] точное имя листа (для range), например `В Работе`.

## Фаза B — Права и доступ

- [ ] Выдать Service Account роль **Editor** на новую таблицу.
- [ ] Проверить, что public CSV export доступен для нового `gid`.

## Фаза C — Pre-Cutover verification (до production)

- [ ] Сверить количество строк и 10 контрольных паспортов между источниками.
- [ ] Проверить, что лист CRM действительно целевой для платформы (не черновик).
- [ ] Подготовить rollback-значения старых ENV (ID/gid/range).

## Фаза D — Cutover (production ENV switch)

- [ ] Обновить в production:
  - [ ] `GOOGLE_SHEETS_SPREADSHEET_ID`
  - [ ] `GOOGLE_SHEETS_PUBLIC_CLIENTS_GID`
  - [ ] `GOOGLE_SHEETS_CLIENTS_RANGE`
- [ ] Применить/перезапустить runtime (по правилам хостинга).

## Фаза E — Post-Cutover smoke (15–30 минут)

- [ ] Пройти smoke checks из раздела 4.
- [ ] Подтвердить отсутствие ошибок по `/clients`, `/crm/leads`, AI Workspace.
- [ ] Зафиксировать результат Go/No-Go.

## Фаза F — Go-Live decision

- [ ] **GO**, если все smoke checks зелёные.
- [ ] **NO-GO + rollback**, если:
  - [ ] `/clients` пустой/неполный
  - [ ] dedup сломан
  - [ ] AI не получает CRM контекст
  - [ ] массовые ошибки поиска.

## Фаза G — Rollback plan

- [ ] Вернуть старые ENV (`SPREADSHEET_ID`, `PUBLIC_CLIENTS_GID`, `CLIENTS_RANGE`).
- [ ] Перезапустить runtime.
- [ ] Проверить восстановление `/clients`, AI, Lead Review.

---

## Примечание по write-path

Этот cutover-чеклист готовит **переключение чтения CRM** на новую Google Sheet.  
Реальная запись из Lead Review (`create_in_crm` write-path) включается отдельной фазой после успешного cutover и readiness-проверок.
