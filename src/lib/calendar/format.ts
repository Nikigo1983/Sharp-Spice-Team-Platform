import { CALENDAR_TIMEZONE } from "./constants";
import { formatDateKey } from "./range";
import type { CalendarEvent, CalendarScope } from "./types";

function createTimeFormatter(ianaTimeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: ianaTimeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

const dayLabelFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDayLabelFormatter(ianaTimeZone: string): Intl.DateTimeFormat {
  let formatter = dayLabelFormatterCache.get(ianaTimeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("ru-RU", {
      timeZone: ianaTimeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    dayLabelFormatterCache.set(ianaTimeZone, formatter);
  }
  return formatter;
}

export function formatScopeLabel(scope: CalendarScope): string {
  return scope === "personal" ? "Личное" : "Компания";
}

export function formatEventTimeRange(
  event: CalendarEvent,
  timeZone: string = CALENDAR_TIMEZONE,
): string {
  if (event.allDay) {
    return "Весь день";
  }

  const formatter = createTimeFormatter(timeZone);
  const start = formatter.format(new Date(event.startAt));
  const end = formatter.format(new Date(event.endAt));
  return `${start} – ${end}`;
}

export function formatDayLabel(
  date: Date,
  timeZone: string = CALENDAR_TIMEZONE,
): string {
  const label = getDayLabelFormatter(timeZone).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function sortEventsByStartAt(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function eventOccursOnDate(
  event: CalendarEvent,
  dateKey: string,
  timeZone: string = CALENDAR_TIMEZONE,
): boolean {
  const startKey = formatDateKey(new Date(event.startAt), timeZone);
  const endKey = formatDateKey(new Date(event.endAt), timeZone);
  return startKey <= dateKey && endKey >= dateKey;
}

export function eventsForDay(
  events: CalendarEvent[],
  dateKey: string,
  timeZone: string = CALENDAR_TIMEZONE,
): CalendarEvent[] {
  return sortEventsByStartAt(
    events.filter((event) => eventOccursOnDate(event, dateKey, timeZone)),
  );
}

export function partitionDayAgenda(events: CalendarEvent[]): {
  allDay: CalendarEvent[];
  timed: CalendarEvent[];
} {
  const sorted = sortEventsByStartAt(events);

  return {
    allDay: sorted.filter((event) => event.allDay),
    timed: sorted.filter((event) => !event.allDay),
  };
}
