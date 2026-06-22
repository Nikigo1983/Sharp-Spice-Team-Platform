import { CALENDAR_TIMEZONE } from "./constants";
import { formatDateKey } from "./range";
import type { CalendarEvent, CalendarScope } from "./types";

const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: CALENDAR_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const dayLabelFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: CALENDAR_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatScopeLabel(scope: CalendarScope): string {
  return scope === "personal" ? "Личное" : "Компания";
}

export function formatEventTimeRange(event: CalendarEvent): string {
  if (event.allDay) {
    return "Весь день";
  }

  const start = timeFormatter.format(new Date(event.startAt));
  const end = timeFormatter.format(new Date(event.endAt));
  return `${start} – ${end}`;
}

export function formatDayLabel(date: Date): string {
  const label = dayLabelFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function sortEventsByStartAt(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function eventOccursOnDate(event: CalendarEvent, dateKey: string): boolean {
  const startKey = formatDateKey(new Date(event.startAt));
  const endKey = formatDateKey(new Date(event.endAt));
  return startKey <= dateKey && endKey >= dateKey;
}

export function eventsForDay(
  events: CalendarEvent[],
  dateKey: string,
): CalendarEvent[] {
  return sortEventsByStartAt(
    events.filter((event) => eventOccursOnDate(event, dateKey)),
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
