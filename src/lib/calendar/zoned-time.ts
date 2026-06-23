import { CALENDAR_TIMEZONE } from "./constants";

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();
const weekdayFormatterCache = new Map<string, Intl.DateTimeFormat>();

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getPartsFormatter(ianaTimeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatterCache.get(ianaTimeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    partsFormatterCache.set(ianaTimeZone, formatter);
  }
  return formatter;
}

function getWeekdayFormatter(ianaTimeZone: string): Intl.DateTimeFormat {
  let formatter = weekdayFormatterCache.get(ianaTimeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimeZone,
      weekday: "short",
    });
    weekdayFormatterCache.set(ianaTimeZone, formatter);
  }
  return formatter;
}

export function getZonedParts(
  date: Date,
  timeZone: string = CALENDAR_TIMEZONE,
): ZonedParts {
  const parts = getPartsFormatter(timeZone).formatToParts(date);
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

export function zonedDateTimeToUtc(
  dateKey: string,
  time: { hours: number; minutes: number; seconds: number },
  timeZone: string = CALENDAR_TIMEZONE,
): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  let utcMs = Date.UTC(year, month - 1, day, time.hours, time.minutes, time.seconds);

  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = getZonedParts(new Date(utcMs), timeZone);
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

export function getZonedWeekday(
  date: Date,
  timeZone: string = CALENDAR_TIMEZONE,
): number {
  const weekday = getWeekdayFormatter(timeZone).format(date);
  return WEEKDAY_INDEX[weekday] ?? 0;
}

export function formatTimeInZone(
  date: Date,
  timeZone: string = CALENDAR_TIMEZONE,
): string {
  const { hour, minute } = getZonedParts(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
