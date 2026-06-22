import { CALENDAR_TIMEZONE } from "./constants";
import { eventsForDay } from "./format";
import { addDaysToDateKey, formatDateKey, parseDateKey } from "./range";
import type { CalendarEvent } from "./types";

export const MONTH_MAX_VISIBLE_CHIPS = 3;

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CALENDAR_TIMEZONE,
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type MonthDayCell = {
  dateKey: string;
  inCurrentMonth: boolean;
  isToday: boolean;
};

function getZonedWeekday(dateKey: string): number {
  const weekday = weekdayFormatter.format(parseDateKey(dateKey));
  return WEEKDAY_INDEX[weekday] ?? 0;
}

function getMondayOfWeek(dateKey: string): string {
  const weekday = getZonedWeekday(dateKey);
  const diff = weekday === 0 ? -6 : 1 - weekday;
  return addDaysToDateKey(dateKey, diff);
}

function getMonthBounds(dateKey: string): { first: string; last: string } {
  const [year, month] = dateKey.split("-").map(Number);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const last = addDaysToDateKey(nextMonth, -1);
  return { first, last };
}

export function buildMonthMatrix(
  anchorDate: Date,
  todayKey: string = formatDateKey(new Date()),
): MonthDayCell[][] {
  const anchorKey = formatDateKey(anchorDate);
  const [year, month] = anchorKey.split("-").map(Number);
  const { first, last } = getMonthBounds(anchorKey);
  const startKey = getMondayOfWeek(first);
  const lastWeekday = getZonedWeekday(last);
  const daysToSunday = lastWeekday === 0 ? 0 : 7 - lastWeekday;
  const endKey = addDaysToDateKey(last, daysToSunday);

  const weeks: MonthDayCell[][] = [];
  let cursor = startKey;

  while (cursor <= endKey) {
    const week: MonthDayCell[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const [cellYear, cellMonth] = cursor.split("-").map(Number);
      week.push({
        dateKey: cursor,
        inCurrentMonth: cellYear === year && cellMonth === month,
        isToday: cursor === todayKey,
      });
      cursor = addDaysToDateKey(cursor, 1);
    }
    weeks.push(week);
  }

  return weeks;
}

export function partitionMonthDayEvents(
  events: CalendarEvent[],
  dateKey: string,
): {
  visible: CalendarEvent[];
  overflow: number;
} {
  const dayEvents = eventsForDay(events, dateKey);
  const visible = dayEvents.slice(0, MONTH_MAX_VISIBLE_CHIPS);
  const overflow = Math.max(0, dayEvents.length - MONTH_MAX_VISIBLE_CHIPS);
  return { visible, overflow };
}

export const MONTH_WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
