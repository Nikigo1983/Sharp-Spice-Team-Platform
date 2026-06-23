import { CALENDAR_TIMEZONE } from "./constants";
import { eventsForDay } from "./format";
import { addDaysToDateKey, formatDateKey, parseDateKey } from "./range";
import type { CalendarEvent } from "./types";
import { getZonedWeekday } from "./zoned-time";

export const MONTH_MAX_VISIBLE_CHIPS = 3;

export type MonthDayCell = {
  dateKey: string;
  inCurrentMonth: boolean;
  isToday: boolean;
};

function getMondayOfWeek(
  dateKey: string,
  timeZone: string = CALENDAR_TIMEZONE,
): string {
  const weekday = getZonedWeekday(parseDateKey(dateKey, timeZone), timeZone);
  const diff = weekday === 0 ? -6 : 1 - weekday;
  return addDaysToDateKey(dateKey, diff, timeZone);
}

function getMonthBounds(
  dateKey: string,
  timeZone: string = CALENDAR_TIMEZONE,
): { first: string; last: string } {
  const [year, month] = dateKey.split("-").map(Number);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const last = addDaysToDateKey(nextMonth, -1, timeZone);
  return { first, last };
}

export function buildMonthMatrix(
  anchorDate: Date,
  todayKey: string = formatDateKey(new Date()),
  timeZone: string = CALENDAR_TIMEZONE,
): MonthDayCell[][] {
  const anchorKey = formatDateKey(anchorDate, timeZone);
  const [year, month] = anchorKey.split("-").map(Number);
  const { first, last } = getMonthBounds(anchorKey, timeZone);
  const startKey = getMondayOfWeek(first, timeZone);
  const lastWeekday = getZonedWeekday(parseDateKey(last, timeZone), timeZone);
  const daysToSunday = lastWeekday === 0 ? 0 : 7 - lastWeekday;
  const endKey = addDaysToDateKey(last, daysToSunday, timeZone);

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
      cursor = addDaysToDateKey(cursor, 1, timeZone);
    }
    weeks.push(week);
  }

  return weeks;
}

export function partitionMonthDayEvents(
  events: CalendarEvent[],
  dateKey: string,
  timeZone: string = CALENDAR_TIMEZONE,
): {
  visible: CalendarEvent[];
  overflow: number;
} {
  const dayEvents = eventsForDay(events, dateKey, timeZone);
  const visible = dayEvents.slice(0, MONTH_MAX_VISIBLE_CHIPS);
  const overflow = Math.max(0, dayEvents.length - MONTH_MAX_VISIBLE_CHIPS);
  return { visible, overflow };
}

export const MONTH_WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
