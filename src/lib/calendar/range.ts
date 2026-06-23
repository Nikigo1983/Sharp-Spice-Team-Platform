import { CALENDAR_TIMEZONE } from "./constants";

export const CALENDAR_VIEW_MODES = ["day", "week", "month"] as const;

export type CalendarViewMode = (typeof CALENDAR_VIEW_MODES)[number];

const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CALENDAR_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

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

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date): ZonedParts {
  const parts = zonedFormatter.formatToParts(date);
  const map = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

export function isCalendarViewMode(value: string): value is CalendarViewMode {
  return CALENDAR_VIEW_MODES.includes(value as CalendarViewMode);
}

export function formatDateKey(date: Date): string {
  const { year, month, day } = getZonedParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function zonedDateTimeToUtc(
  dateKey: string,
  time: { hours: number; minutes: number; seconds: number },
): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  let utcMs = Date.UTC(year, month - 1, day, time.hours, time.minutes, time.seconds);

  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = getZonedParts(new Date(utcMs));
    const correctionSeconds =
      ((year - parts.year) * 365 +
        (month - parts.month) * 30 +
        (day - parts.day)) *
        86400 +
      (time.hours - parts.hour) * 3600 +
      (time.minutes - parts.minute) * 60 +
      (time.seconds - parts.second);

    if (correctionSeconds === 0) {
      break;
    }

    utcMs += correctionSeconds * 1000;
  }

  return new Date(utcMs);
}

export function parseDateKey(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) {
    return new Date();
  }

  const dateKey = `${match[1]}-${match[2]}-${match[3]}`;
  return zonedDateTimeToUtc(dateKey, { hours: 12, minutes: 0, seconds: 0 });
}

function startOfZonedDay(dateKey: string): Date {
  return zonedDateTimeToUtc(dateKey, { hours: 0, minutes: 0, seconds: 0 });
}

/** Local calendar-day start (00:00) in CALENDAR_TIMEZONE for an ISO instant. */
export function getZonedDayStartFromIso(iso: string): Date {
  return startOfZonedDay(formatDateKey(new Date(iso)));
}

function endOfZonedDay(dateKey: string): Date {
  return startOfZonedDay(addDaysToDateKey(dateKey, 1));
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const anchor = parseDateKey(dateKey);
  return formatDateKey(new Date(anchor.getTime() + days * 86_400_000));
}

function getZonedWeekday(dateKey: string): number {
  const weekday = weekdayFormatter.format(startOfZonedDay(dateKey));
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

export function getRangeForView(
  view: CalendarViewMode,
  anchorDate: Date,
): { from: string; to: string } {
  const anchorKey = formatDateKey(anchorDate);

  if (view === "day") {
    return {
      from: startOfZonedDay(anchorKey).toISOString(),
      to: endOfZonedDay(anchorKey).toISOString(),
    };
  }

  if (view === "week") {
    const monday = getMondayOfWeek(anchorKey);
    const sunday = addDaysToDateKey(monday, 6);
    return {
      from: startOfZonedDay(monday).toISOString(),
      to: endOfZonedDay(sunday).toISOString(),
    };
  }

  const { first, last } = getMonthBounds(anchorKey);
  const fromKey = addDaysToDateKey(first, -7);
  const toKey = addDaysToDateKey(last, 7);

  return {
    from: startOfZonedDay(fromKey).toISOString(),
    to: endOfZonedDay(toKey).toISOString(),
  };
}

export function shiftAnchorDate(
  view: CalendarViewMode,
  anchorDate: Date,
  direction: -1 | 1,
): Date {
  const anchorKey = formatDateKey(anchorDate);

  if (view === "day") {
    return parseDateKey(addDaysToDateKey(anchorKey, direction));
  }

  if (view === "week") {
    return parseDateKey(addDaysToDateKey(anchorKey, direction * 7));
  }

  const [year, month] = anchorKey.split("-").map(Number);
  const shiftedMonth = month + direction;
  const shiftedYear = shiftedMonth < 1 ? year - 1 : shiftedMonth > 12 ? year + 1 : year;
  const normalizedMonth =
    shiftedMonth < 1 ? 12 : shiftedMonth > 12 ? 1 : shiftedMonth;
  const day = Number(anchorKey.split("-")[2]);
  const lastDay = Number(
    addDaysToDateKey(
      shiftedMonth === 12
        ? `${shiftedYear + 1}-01-01`
        : `${shiftedYear}-${String(normalizedMonth + 1).padStart(2, "0")}-01`,
      -1,
    ).split("-")[2],
  );
  const clampedDay = Math.min(day, lastDay);
  return parseDateKey(
    `${shiftedYear}-${String(normalizedMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`,
  );
}

export function formatToolbarLabel(
  view: CalendarViewMode,
  anchorDate: Date,
): string {
  const anchorKey = formatDateKey(anchorDate);

  if (view === "day") {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: CALENDAR_TIMEZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(anchorDate);
  }

  if (view === "week") {
    const monday = getMondayOfWeek(anchorKey);
    const sunday = addDaysToDateKey(monday, 6);
    const mondayDate = startOfZonedDay(monday);
    const sundayDate = startOfZonedDay(sunday);
    const fromLabel = new Intl.DateTimeFormat("ru-RU", {
      timeZone: CALENDAR_TIMEZONE,
      day: "numeric",
      month: "short",
    }).format(mondayDate);
    const toLabel = new Intl.DateTimeFormat("ru-RU", {
      timeZone: CALENDAR_TIMEZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(sundayDate);
    return `${fromLabel} – ${toLabel}`;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: CALENDAR_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(anchorDate);
}
