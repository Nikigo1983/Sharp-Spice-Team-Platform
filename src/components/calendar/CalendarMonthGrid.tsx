"use client";

import { useMemo } from "react";
import { formatDateKey } from "@/lib/calendar/range";
import {
  MONTH_WEEKDAY_LABELS,
  buildMonthMatrix,
  partitionMonthDayEvents,
} from "@/lib/calendar/month";
import type { CalendarEvent } from "@/lib/calendar/types";
import { CalendarEventChip } from "./CalendarEventChip";
import styles from "./CalendarMonthGrid.module.css";

type CalendarMonthGridProps = {
  anchorDate: Date;
  events: CalendarEvent[];
  onDayClick: (dateKey: string) => void;
};

function dayNumber(dateKey: string): string {
  return String(Number(dateKey.split("-")[2]));
}

export function CalendarMonthGrid({
  anchorDate,
  events,
  onDayClick,
}: CalendarMonthGridProps) {
  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const weeks = useMemo(
    () => buildMonthMatrix(anchorDate, todayKey),
    [anchorDate, todayKey],
  );

  return (
    <div className={styles.grid} role="grid" aria-label="Календарь месяца">
      <div className={styles.weekdayRow} role="row">
        {MONTH_WEEKDAY_LABELS.map((label) => (
          <div key={label} className={styles.weekdayCell} role="columnheader">
            {label}
          </div>
        ))}
      </div>

      {weeks.map((week) => (
        <div
          key={week[0]?.dateKey ?? week.map((cell) => cell.dateKey).join("-")}
          className={styles.weekRow}
          role="row"
        >
          {week.map((cell) => {
            const { visible, overflow } = partitionMonthDayEvents(
              events,
              cell.dateKey,
            );

            return (
              <button
                key={cell.dateKey}
                type="button"
                className={[
                  styles.dayCell,
                  cell.inCurrentMonth ? styles.inMonth : styles.outOfMonth,
                  cell.isToday ? styles.today : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onDayClick(cell.dateKey)}
                aria-label={`День ${cell.dateKey}`}
              >
                <span className={styles.dayNumber}>{dayNumber(cell.dateKey)}</span>
                <div className={styles.events}>
                  {visible.map((event) => (
                    <CalendarEventChip
                      key={event.id}
                      event={event}
                      variant="month"
                    />
                  ))}
                  {overflow > 0 ? (
                    <span className={styles.overflow}>+{overflow} ещё</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
