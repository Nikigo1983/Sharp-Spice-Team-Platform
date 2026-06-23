import { CALENDAR_TIMEZONE } from "./constants";
import { eventsForDay, sortEventsByStartAt } from "./format";
import { addDaysToDateKey, formatDateKey, parseDateKey } from "./range";
import type { CalendarEvent } from "./types";
import { MONTH_WEEKDAY_LABELS } from "./month";

export const WEEK_GRID_START_HOUR = 7;
export const WEEK_GRID_END_HOUR = 20;
export const WEEK_SLOT_MINUTES = 30;

export const WEEK_GRID_TOTAL_MINUTES =
  (WEEK_GRID_END_HOUR - WEEK_GRID_START_HOUR) * 60;

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
  hour: number;
  minute: number;
};

function getZonedParts(date: Date): ZonedParts {
  const parts = zonedFormatter.formatToParts(date);
  const map = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function getZonedWeekday(dateKey: string): number {
  const weekday = weekdayFormatter.format(parseDateKey(dateKey));
  return WEEKDAY_INDEX[weekday] ?? 0;
}

function getMondayOfWeek(dateKey: string): string {
  const weekday = getZonedWeekday(dateKey);
  const diff = weekday === 0 ? -6 : 1 - weekday;
  return addDaysToDateKey(dateKey, diff);
}

function getMinutesFromMidnight(iso: string): number {
  const { hour, minute } = getZonedParts(new Date(iso));
  return hour * 60 + minute;
}

export type WeekDayColumn = {
  dateKey: string;
  weekdayLabel: string;
  dayNumber: string;
  isToday: boolean;
};

export type WeekTimedLayout = {
  event: CalendarEvent;
  topRatio: number;
  heightRatio: number;
  stackIndex: number;
  stackCount: number;
};

export function buildWeekColumns(
  anchorDate: Date,
  todayKey: string = formatDateKey(new Date()),
): WeekDayColumn[] {
  const monday = getMondayOfWeek(formatDateKey(anchorDate));
  const columns: WeekDayColumn[] = [];

  for (let index = 0; index < 7; index++) {
    const dateKey = addDaysToDateKey(monday, index);
    columns.push({
      dateKey,
      weekdayLabel: MONTH_WEEKDAY_LABELS[index],
      dayNumber: String(Number(dateKey.split("-")[2])),
      isToday: dateKey === todayKey,
    });
  }

  return columns;
}

export function getWeekHourLabels(): string[] {
  const labels: string[] = [];
  for (let hour = WEEK_GRID_START_HOUR; hour < WEEK_GRID_END_HOUR; hour++) {
    labels.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return labels;
}

export function getAllDayEventsForWeekDay(
  events: CalendarEvent[],
  dateKey: string,
): CalendarEvent[] {
  return sortEventsByStartAt(
    eventsForDay(events, dateKey).filter((event) => event.allDay),
  );
}

export function getEventDayTimeRange(
  event: CalendarEvent,
  dateKey: string,
): { startMinutes: number; endMinutes: number } | null {
  const startKey = formatDateKey(new Date(event.startAt));
  const endKey = formatDateKey(new Date(event.endAt));

  if (dateKey < startKey || dateKey > endKey) {
    return null;
  }

  const startMinutes =
    dateKey === startKey ? getMinutesFromMidnight(event.startAt) : 0;
  const endMinutes =
    dateKey === endKey ? getMinutesFromMidnight(event.endAt) : 24 * 60;

  if (endMinutes <= startMinutes) {
    return null;
  }

  return { startMinutes, endMinutes };
}

export function layoutWeekTimedEvents(
  events: CalendarEvent[],
  dateKey: string,
): WeekTimedLayout[] {
  const gridStart = WEEK_GRID_START_HOUR * 60;
  const gridEnd = WEEK_GRID_END_HOUR * 60;
  const gridSpan = WEEK_GRID_TOTAL_MINUTES;

  const timed = sortEventsByStartAt(
    eventsForDay(events, dateKey).filter((event) => !event.allDay),
  );

  const placements: Array<{
    event: CalendarEvent;
    start: number;
    end: number;
    stackIndex: number;
  }> = [];

  for (const event of timed) {
    const range = getEventDayTimeRange(event, dateKey);
    if (!range) continue;

    const start = Math.max(range.startMinutes, gridStart);
    const end = Math.min(range.endMinutes, gridEnd);
    if (end <= start) continue;

    const overlapping = placements.filter(
      (placement) => placement.start < end && placement.end > start,
    );

    placements.push({
      event,
      start,
      end,
      stackIndex: overlapping.length,
    });
  }

  return placements.map((placement) => {
    const cluster = placements.filter(
      (item) =>
        item.start < placement.end && item.end > placement.start,
    );
    const stackCount = Math.max(...cluster.map((item) => item.stackIndex)) + 1;
    const segmentDuration = placement.end - placement.start;
    const sliceHeight = segmentDuration / stackCount;
    const sliceStart = placement.start + placement.stackIndex * sliceHeight;

    return {
      event: placement.event,
      topRatio: (sliceStart - gridStart) / gridSpan,
      heightRatio: sliceHeight / gridSpan,
      stackIndex: placement.stackIndex,
      stackCount,
    };
  });
}

export function weekGridHasAllDayEvents(
  events: CalendarEvent[],
  columns: WeekDayColumn[],
): boolean {
  return columns.some(
    (column) => getAllDayEventsForWeekDay(events, column.dateKey).length > 0,
  );
}
