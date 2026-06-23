"use client";

import {
  buildDateKey,
  buildYearOptions,
  CALENDAR_MONTHS_RU,
  daysInMonth,
  formatDateKeyRu,
  parseDateKey,
} from "@/lib/calendar/datetime-input";
import styles from "./CalendarDateTimeInput.module.css";

type CalendarDateSelectProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
};

export function CalendarDateSelect({ value, onChange, id }: CalendarDateSelectProps) {
  const parsed = parseDateKey(value) ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
  };

  const yearOptions = buildYearOptions(parsed.year);
  const dayOptions = Array.from(
    { length: daysInMonth(parsed.year, parsed.month) },
    (_, index) => index + 1,
  );

  function update(parts: Partial<typeof parsed>) {
    const next = { ...parsed, ...parts };
    const maxDay = daysInMonth(next.year, next.month);
    if (next.day > maxDay) {
      next.day = maxDay;
    }
    onChange(buildDateKey(next));
  }

  return (
    <div className={styles.dateWrap} id={id}>
      <div className={styles.selectRow}>
        <select
          className={[styles.select, styles.selectDay].join(" ")}
          aria-label="День"
          value={parsed.day}
          onChange={(event) => update({ day: Number(event.target.value) })}
        >
          {dayOptions.map((day) => (
            <option key={day} value={day}>
              {String(day).padStart(2, "0")}
            </option>
          ))}
        </select>

        <select
          className={[styles.select, styles.selectMonth].join(" ")}
          aria-label="Месяц"
          value={parsed.month}
          onChange={(event) => update({ month: Number(event.target.value) })}
        >
          {CALENDAR_MONTHS_RU.map((label, index) => (
            <option key={label} value={index + 1}>
              {label}
            </option>
          ))}
        </select>

        <select
          className={[styles.select, styles.selectYear].join(" ")}
          aria-label="Год"
          value={parsed.year}
          onChange={(event) => update({ year: Number(event.target.value) })}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <span className={styles.hint}>{formatDateKeyRu(value)}</span>
    </div>
  );
}
