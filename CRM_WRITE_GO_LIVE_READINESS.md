# CRM Write Go-Live Readiness Audit

**Дата:** 16 июня 2026  
**Формат:** только аудит (без изменений кода/данных, без записи в CRM)

---

## Исходные вводные

- CRM native Google Sheet: готова
- Dry Run pipeline: реализован
- Desk Dedup Design: подготовлен
- По `CRM_DEDUP_GAP_ANALYSIS.md`: 3 реальных дубля обнаружены через Emigrant Desk

---

## 1) Coverage полей Emigrant Desk (фактический)

Актуальный срез по клиентам Desk: **88** клиентов.

| Поле | Coverage |
|---|---|
| `case_number` | **88/88** |
| `email` | **88/88** |
| `full_name` (`first_name + last_name`) | **88/88** |
| `current_status` | **88/88** |
| `user_id` | **88/88** |

---

## 2) Сила сигналов дедупликации по полям Desk

| Поле Desk | Сигнал для dedup | Класс | Обоснование |
|---|---|---|---|
| `case_number` | match с `lead.passport` (normalized) | **STRONG** | На текущих данных это надежный идентификатор клиента/дела; уже поймал 3 реальных дубля |
| `email` | exact normalized match | **STRONG** | Сильный контактный идентификатор; особенно в паре с ФИО или case_number |
| `full_name` | surname+name match (без отчества) | **MEDIUM** | В Desk часто без отчества; полезно как подтверждение, но не как одиночный блокер |
| `user_id` | internal UUID | **WEAK для лида** | Очень надежен внутри Desk, но у нового Formgrid лида этого ID нет до линковки |
| `current_status` | стадия дела | **WEAK** | Бизнес-статус, не идентификатор личности |

---

## 3) Моделирование нового dedup

Моделируемый порядок сигналов:

1. `passport`
2. `phone`
3. `email`
4. `telegram`
5. `Desk case_number`
6. `Desk email`
7. `Desk full_name`

### Правило интерпретации

- Любой strong-match по пп. 1-6 -> `HIGH` (auto-block)
- Только `Desk full_name` (без passport/email) -> `MEDIUM` (manual review)
- Нет срабатываний -> `LOW`

### Результат на текущих лидах (11 лидов)

Опираясь на предыдущие аудиты:

- 5 лидов уже `HIGH` из-за existing strong duplicate (CRM/Formgrid passport)
- 3 лида дополнительно переходят в `HIGH` через Desk (`case_number`/`email`)
- 3 лида остаются без duplicate-сигналов (`LOW`)

Итог распределения:

| Класс | Кол-во |
|---|---|
| **LOW** | **3** |
| **MEDIUM** | **0** |
| **HIGH** | **8** |

---

## 4) Главный вопрос: останутся ли известные сценарии создания дублей?

### По текущему набору известных кейсов: **нет**

После внедрения Desk-aware dedup, все известные сценарии дублей из текущего аудита закрываются:

- Белоногова -> блок по `Desk case_number == passport`
- Бякова -> блок по `Desk case_number` + `Desk email`
- Тайк -> блок по `Desk case_number` + `Desk email`

Новых известных незакрытых duplicate-сценариев в текущем датасете не выявлено.

---

## Вердикт

## READY FOR REAL CRM WRITE

**Пояснение:** при условии, что Desk-aware dedup внедрен ровно по проекту (`case_number` и `email` как STRONG, `full_name` как MEDIUM), известных путей создания дублей в текущем наборе лидов не остается.

---

## Операционные замечания (не блокеры duplicate-go-live)

- Тестовые/служебные лиды (например, с `test` в ФИО) остаются задачей data-quality, а не dedup.
- Рекомендуется вести отдельный счетчик `BLOCKED_STRONG_DUPLICATE` для контроля эффекта Desk-aware дедупликации после включения write.
