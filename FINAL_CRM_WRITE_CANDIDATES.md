# Final CRM Write Candidates Audit

Дата: 2026-06-16T12:57:19.365Z

Ограничения:
- Без записи в CRM.
- Без изменения статусов.
- Без изменения данных.

## LOW лиды после Desk-aware dedup

| ФИО | Паспорт | Телефон | Email | Совпадение в CRM | Совпадение в Formgrid | Совпадение в Emigrant Desk | Почему LOW | Проверенные сигналы |
|---|---|---|---|---|---|---|---|---|
| Белоусова тест 2 | 54689743 | 351912768611 | virineya1983@gmail.com | нет | нет | нет | нет strong и medium сигналов по dedup-матрице | passport, phone, email, telegram, desk_case_number, desk_email, desk_full_name |
| ЕДРЕЦ ЕВГЕНИЯ ГРИГОРЬЕВНА | 772808561 | 905556366676 | e.edrets@outlook.com | нет | нет | нет | нет strong и medium сигналов по dedup-матрице | passport, phone, email, telegram, desk_case_number, desk_email, desk_full_name |

## Если сейчас включить CRM_WRITE_ENABLED=true

Будут созданы только лиды из списка `SAFE_TO_CREATE_IN_CRM` ниже (то есть текущие LOW).

## SAFE_TO_CREATE_IN_CRM

Количество: **2**

| Formgrid row | ФИО | Паспорт | Телефон | Email |
|---|---|---|---|---|
| 2 | Белоусова тест 2 | 54689743 | 351912768611 | virineya1983@gmail.com |
| 12 | ЕДРЕЦ ЕВГЕНИЯ ГРИГОРЬЕВНА | 772808561 | 905556366676 | e.edrets@outlook.com |
