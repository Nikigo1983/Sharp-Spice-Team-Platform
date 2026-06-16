# Desk-aware Dedup Design

**Дата:** 16 июня 2026  
**Режим:** только анализ и проектирование (без изменений кода, без записи в CRM)

---

## Контекст и цель

По `CRM_DEDUP_GAP_ANALYSIS.md`:

- 4 лидов в `HIGH RISK`
- 3 из 4 уже существуют в `Emigrant Desk`
- текущий dedup блокирует только `CRM + Formgrid`, Desk не участвует

Цель: встроить `Emigrant Desk` в dedup перед `create_in_crm`, чтобы автоматически блокировать реальные дубли до append в CRM.

---

## 1) Встраивание Emigrant Desk в текущий pipeline

### Текущий порядок сигналов

1. passport  
2. phone  
3. email  
4. telegram  
5. FIO

### Новый порядок (Desk-aware)

**Этап A. Existing strong (без изменений логики):**
1. `CRM/Formgrid passport`
2. `CRM/Formgrid phone`
3. `CRM/Formgrid email`
4. `CRM/Formgrid telegram`

**Этап B. Desk-aware strong/medium:**
5. `Desk case_number == normalized_passport` (**STRONG**)
6. `Desk email == normalized_email` (**STRONG**)
7. `Desk full_name match (surname+name, patronymic optional)` (**MEDIUM**, повышается до STRONG в комбинации)

**Этап C. Final review signal:**
8. `FIO-only (existing possible duplicate)` (**WEAK/MEDIUM**, non-blocking)

### Предлагаемое правило блокировки

Блокировать `create_in_crm` (HTTP 409), если:

- сработал любой existing strong из CRM/Formgrid, **или**
- сработал `Desk case_number == passport`, **или**
- `Desk email == email`, **или**
- `Desk name match` + (`Desk case_number == passport` **или** `Desk email == email`)

Иначе:

- только name-match без passport/email -> `MEDIUM`, ручная проверка (не auto-block)

---

## 2) Оценка полей Emigrant Desk

| Поле | Где хранится | Надежность | Strong signal? | Комментарий |
|---|---|---|---|---|
| `case_number` | `cases.case_number` | Высокая | **Да** | На текущих данных совпадает с паспортом клиента; лучший identity bridge Desk↔Formgrid |
| `email` | `profiles.email` | Средняя/высокая | **Да** | Может меняться, но полезен как strong при точном совпадении |
| `full_name` | `profiles.last_name + first_name` | Средняя | Условно | Без отчества, возможны омонимы; лучше как medium/подтверждающий |
| `user_id` | `profiles.user_id` | Очень высокая | Нет (для lead) | Стабильный internal ID, но у Formgrid лида этого ID нет до линковки |
| `current_status` | `cases.current_status` | Низкая для identity | Нет | Бизнес-стадия, не идентификатор личности |

---

## 3) Матрица сигналов Desk

### Базовые сигналы

- `Desk passport match` := `normalized(lead.passport) == normalized(desk.case_number)`
- `Desk email match` := `normalized(lead.email) == normalized(desk.email)`
- `Desk name match` := `surname+name` (без обязательного отчества, с нормализацией `ё/е`)

### Классификация силы

| Комбинация | Класс |
|---|---|
| passport match | **STRONG** |
| email match | **STRONG** |
| passport + name | **STRONG** |
| email + name | **STRONG** |
| passport + email | **STRONG** |
| name only | **MEDIUM** |
| partial name / fuzzy only | **WEAK** |

### Решение по действию

| Класс | Действие |
|---|---|
| STRONG | auto-block (409) |
| MEDIUM | review queue (manual confirm) |
| WEAK | не блокировать, но логировать |

---

## 4) Моделирование на текущих данных

Основа: `CRM_WRITE_DRY_RUN_SAFETY_AUDIT.md` + `CRM_DEDUP_GAP_ANALYSIS.md`

Текущие HIGH:
1. Белоусова тест 2
2. Белоногова Мария Павловна
3. Бякова Мария Николаевна
4. Тайк Филипп Майерович

### Эффект Desk-aware правил

- Белоногова: `Desk case_number == passport` + name match -> **STRONG block**
- Бякова: `Desk case_number == passport` + `Desk email == email` + name match -> **STRONG block**
- Тайк: `Desk case_number == passport` + `Desk email == email` + name match -> **STRONG block**
- Белоусова тест 2: Desk совпадений нет -> не Desk-block (остается quality/test risk)

Итог моделирования:

- **HIGH, auto-blocked как дубли:** `3/4`
- **LOW, остаются LOW:** `2/2` (Кулешова, ЕДРЕЦ)

---

## 5) Изменение статистики

Базовая статистика (до Desk-aware dedup, из safety-аудита):

- LOW: **2**
- MEDIUM: **0**
- HIGH: **4**

Проектная статистика после Desk-aware dedup (risk after auto-block gate):

- LOW: **2**
- MEDIUM: **0**
- HIGH: **1** *(Белоусова тест 2; не дубль, но data-quality/test risk)*

Дополнительно (новый операционный показатель):

- **BLOCKED_STRONG_DUPLICATE: 3** *(Белоногова, Бякова, Тайк)*

> Примечание: если отчеты должны оставаться строго в шкале LOW/MEDIUM/HIGH без отдельной категории BLOCKED, то эти 3 можно считать HIGH-Blocked. Для операционного контроля лучше выделять отдельный счетчик `BLOCKED_STRONG_DUPLICATE`.

---

## 6) Главный вопрос: можно ли включать real CRM write?

### Вердикт: **NOT READY**

Причины:

1. Desk-aware dedup концептуально закрывает ключевой gap (3 реальных дубля), но еще не внедрен.
2. Остается риск test/data-quality кейсов (пример: Белоусова тест 2).
3. Нужен отдельный guardrail на pre-write validation (консистентно в runtime, не только в аудит-скриптах).
4. Перед go-live требуется контрольная dry-run/canary итерация уже с Desk-aware правилами.

### Что должно быть true для перехода в READY

- Desk signals включены в pre-write dedup и покрыты тестами.
- Есть отдельный статус/метрика `BLOCKED_STRONG_DUPLICATE`.
- Test-data guard (`test/тест/asdf/qwe`, служебные email) работает на runtime пути.
- Повторный dry-run подтверждает:
  - 0 пропущенных TRUE DUPLICATE,
  - 0 ложных auto-block критичного уровня,
  - стабильную долю LOW для безопасного auto-create.

---

## Краткий итог дизайна

- Самый эффективный шаг: `Desk case_number == passport` как STRONG.
- Второй по эффекту: `Desk email == lead email` как STRONG.
- `Desk name match` использовать как MEDIUM или как усиливающий фактор к passport/email.
- На текущих данных это автоматически убирает **3 из 4 HIGH** как реальные дубли.
