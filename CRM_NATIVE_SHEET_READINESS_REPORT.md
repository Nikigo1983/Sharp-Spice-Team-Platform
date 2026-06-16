# CRM Native Sheet Readiness Report

**Дата проверки:** 16 июня 2026  
**Режим:** read-only аудит, без записи и без изменений ENV  
**Проверяемый Spreadsheet ID:** `138W2nHQcJu_xRsI2RBqeD6Oq8Tg9FbKH`

---

## Результаты проверки

### 1) Является ли новая таблица native Google Spreadsheet (не XLSX)

**Нет.**

- `drive.files.get` вернул `mimeType`:
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Имя файла: `таблица Клиенты Хорватия.xlsx`

Это Excel-файл на Drive, не нативная Google Таблица.

### 2) Есть ли у Service Account доступ Editor

**Да.**

- Service Account: `sharp-spice-platform@project-3bfd25e8-8781-480b-8f9.iam.gserviceaccount.com`
- В permissions роль: `writer` (Editor-level для Google file access)

### 3) Spreadsheet ID

`138W2nHQcJu_xRsI2RBqeD6Oq8Tg9FbKH`

### 4) gid вкладки "В Работе"

**Не удалось определить через Sheets API**, потому что API к этому файлу возвращает `400` (Office file).  
Через API нельзя получить metadata листов (`sheets.properties.title/sheetId`) для текущего XLSX.

### 5) Читается ли вкладка через Google Sheets API

**Нет.**

- `spreadsheets.get` → HTTP `400`

### 6) Существует ли диапазон `'В Работе'!A:M`

**Через Sheets API проверить нельзя на текущем файле** (тот же `400`).

- `values.get('В Работе'!A:M)` → HTTP `400`

### 7) Сможет ли append работать через Sheets API (без записи)

**Нет, не в текущем состоянии.**

Причина: файл не native Google Spreadsheet, поэтому Sheets API write/read path для range-операций недоступен.

### 8) Выполнялась ли запись

**Нет.**  
Write-запросы (`append`) не выполнялись.

### 9) Менялся ли ENV

**Нет.**  
Проверка выполнена без изменений ENV.

---

## Технический вердикт

## **NOT READY**

### Причины

1. Текущий CRM-файл — `.xlsx`, не native Google Spreadsheet.
2. `spreadsheets.get` и `values.get` по этому файлу возвращают `400`.
3. Без миграции в native Google Sheet невозможно подтвердить/использовать range `'В Работе'!A:M` для write-path.

### Что уже готово

- Service Account доступ `writer` к текущему файлу подтвержден.

