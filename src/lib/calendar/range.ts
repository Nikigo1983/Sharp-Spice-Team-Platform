import { CALENDAR_TIMEZONE } from "./constants";
import {
  getZonedParts,
  getZonedWeekday,
  zonedDateTimeToUtc,
} from "./zoned-time";

export const CALENDAR_VIEW_MODES = ["day", "week", "month"] as const;

export type CalendarViewMode = (typeof CALENDAR_VIEW_MODES)[number];

export function isCalendarViewMode(value: string): value is CalendarViewMode {
  return CALENDAR_VIEW_MODES.includes(value as CalendarViewMode);
}

export function formatDateKey(
  date: Date,
  timeZone: string = CALENDAR_TIMEZONE,
): string {
  const { year, month, day } = getZonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDateKey(
  key: string,
  timeZone: string = CALENDAR_TIMEZONE,
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) {
    return new Date();
  }

  const dateKey = `${match[1]}-${match[2]}-${match[3]}`;
  return zonedDateTimeToUtc(
    dateKey,
    { hours: 12, minutes: 0, seconds: 0 },
    timeZone,
  );
}

function startOfZonedDay(
  dateKey: string,
  timeZone: string = CALENDAR_TIMEZONE,
): Date {
  return zonedDateTimeToUtc(
    dateKey,
    { hours: 0, minutes: 0, seconds: 0 },
    timeZone,
  );
}

/** Local calendar-day start (00:00) in the given time zone for an ISO instant. */
export function getZonedDayStartFromIso(
  iso: string,
  timeZone: string = CALENDAR_TIMEZONE,
): Date {
  return startOfZonedDay(formatDateKey(new Date(iso), timeZone), timeZone);
}

function endOfZonedDay(
  dateKey: string,
  timeZone: string = CALENDAR_TIMEZONE,
): Date {
  return startOfZonedDay(addDaysToDateKey(dateKey, 1, timeZone), timeZone);
}

export function addDaysToDateKey(
  dateKey: string,
  days: number,
  timeZone: string = CALENDAR_TIMEZONE,
): string {
  const anchor = parseDateKey(dateKey, timeZone);
  return formatDateKey(new Date(anchor.getTime() + days * 86_400_000), timeZone);
}

function getMondayOfWeek(
  dateKey: string,
  timeZone: string = CALENDAR_TIMEZONE,
): string {
  const weekday = getZonedWeekday(startOfZonedDay(dateKey, timeZone), timeZone);
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

export function getRangeForView(
  view: CalendarViewMode,
  anchorDate: Date,
  timeZone: string = CALENDAR_TIMEZONE,
): { from: string; to: string } {
  const anchorKey = formatDateKey(anchorDate, timeZone);

  if (view === "day") {
    return {
      from: startOfZonedDay(anchorKey, timeZone).toISOString(),
      to: endOfZonedDay(anchorKey, timeZone).toISOString(),
    };
  }

  if (view === "week") {
    const monday = getMondayOfWeek(anchorKey, timeZone);
    const sunday = addDaysToDateKey(monday, 6, timeZone);
    return {
      from: startOfZonedDay(monday, timeZone).toISOString(),
      to: endOfZonedDay(sunday, timeZone).toISOString(),
    };
  }

  const { first, last } = getMonthBounds(anchorKey, timeZone);
  const fromKey = addDaysToDateKey(first, -7, timeZone);
  const toKey = addDaysToDateKey(last, 7, timeZone);

  return {
    from: startOfZonedDay(fromKey, timeZone).toISOString(),
    to: endOfZonedDay(toKey, timeZone).toISOString(),
  };
}

export function shiftAnchorDate(
  view: CalendarViewMode,
  anchorDate: Date,
  direction: -1 | 1,
  timeZone: string = CALENDAR_TIMEZONE,
): Date {
  const anchorKey = formatDateKey(anchorDate, timeZone);

  if (view === "day") {
    return parseDateKey(addDaysToDateKey(anchorKey, direction, timeZone), timeZone);
  }

  if (view === "week") {
    return parseDateKey(
      addDaysToDateKey(anchorKey, direction * 7, timeZone),
      timeZone,
    );
  }

  const [year, month] = anchorKey.split("-").map(Number);
  const shiftedMonth = month + direction;
  const shiftedYear = shiftedMonth < 1 ? year - 1 : shiftedMonth > 12 ? year + 1 : year;
  const normalizedMonth =
    shiftedMonth < 1 ? 12 : shiftedMonth > 12 ? 1 : shiftedMonth;
  const day = Number(anchorKey.split("-")[2]);
  const lastDay = Number(
    addDaysToDateKey(
      normalizedMonth === 12
        ? `${shiftedYear + 1}-01-01`
        : `${shiftedYear}-${String(normalizedMonth + 1).padStart(2, "0")}-01`,
      -1,
      timeZone,
    ).split("-")[2],
  );
  const clampedDay = Math.min(day, lastDay);
  return parseDateKey(
    `${shiftedYear}-${String(normalizedMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`,
    timeZone,
  );
}

export function formatToolbarLabel(
  view: CalendarViewMode,
  anchorDate: Date,
  timeZone: string = CALENDAR_TIMEZONE,
): string {
  const anchorKey = formatDateKey(anchorDate, timeZone);

  if (view === "day") {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(anchorDate);
  }

  if (view === "week") {
    const monday = getMondayOfWeek(anchorKey, timeZone);
    const sunday = addDaysToDateKey(monday, 6, timeZone);
    const mondayDate = startOfZonedDay(monday, timeZone);
    const sundayDate = startOfZonedDay(sunday, timeZone);
    const fromLabel = new Intl.DateTimeFormat("ru-RU", {
      timeZone: timeZone,
      day: "numeric",
      month: "short",
    }).format(mondayDate);
    const toLabel = new Intl.DateTimeFormat("ru-RU", {
      timeZone: timeZone,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(sundayDate);
    return `${fromLabel} – ${toLabel}`;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timeZone,
    month: "long",
    year: "numeric",
  }).format(anchorDate);
}
