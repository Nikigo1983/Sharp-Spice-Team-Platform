"use client";

import {
  buildMinuteOptions,
  buildTimeValue,
  formatTimeValueRu,
  parseTimeParts,
  snapMinuteToStep,
} from "@/lib/calendar/datetime-input";
import styles from "./CalendarDateTimeInput.module.css";

type CalendarTimeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
};

const MINUTE_STEP = 5;
const minuteOptions = buildMinuteOptions(MINUTE_STEP);
const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);

export function CalendarTimeSelect({ value, onChange, id }: CalendarTimeSelectProps) {
  const parsed = parseTimeParts(value) ?? { hours: 10, minutes: 0 };
  const selectedMinute = minuteOptions.includes(parsed.minutes)
    ? parsed.minutes
    : snapMinuteToStep(parsed.minutes, MINUTE_STEP);

  function update(parts: Partial<typeof parsed>) {
    onChange(
      buildTimeValue({
        hours: parts.hours ?? parsed.hours,
        minutes: parts.minutes ?? selectedMinute,
      }),
    );
  }

  return (
    <div className={styles.timeWrap} id={id}>
      <div className={styles.selectRow}>
        <select
          className={styles.select}
          aria-label="Часы"
          value={parsed.hours}
          onChange={(event) => update({ hours: Number(event.target.value) })}
        >
          {hourOptions.map((hour) => (
            <option key={hour} value={hour}>
              {String(hour).padStart(2, "0")}
            </option>
          ))}
        </select>
        <span className={styles.timeSeparator} aria-hidden>
          :
        </span>
        <select
          className={styles.select}
          aria-label="Минуты"
          value={selectedMinute}
          onChange={(event) => update({ minutes: Number(event.target.value) })}
        >
          {minuteOptions.map((minute) => (
            <option key={minute} value={minute}>
              {String(minute).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>
      <span className={styles.hint}>{formatTimeValueRu(value)}</span>
    </div>
  );
}
