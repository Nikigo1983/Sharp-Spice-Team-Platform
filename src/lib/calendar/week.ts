import { CALENDAR_TIMEZONE } from "./constants";
import { eventsForDay, sortEventsByStartAt } from "./format";
import { addDaysToDateKey, formatDateKey, parseDateKey } from "./range";
import type { CalendarEvent } from "./types";
import { MONTH_WEEKDAY_LABELS } from "./month";
import { getZonedParts, getZonedWeekday } from "./zoned-time";

export const WEEK_GRID_START_HOUR = 7;
export const WEEK_GRID_END_HOUR = 20;
export const WEEK_SLOT_MINUTES = 30;

export const WEEK_GRID_TOTAL_MINUTES =
  (WEEK_GRID_END_HOUR - WEEK_GRID_START_HOUR) * 60;

function getMondayOfWeek(
  dateKey: string,
  timeZone: string = CALENDAR_TIMEZONE,
): string {
  const weekday = getZonedWeekday(parseDateKey(dateKey, timeZone), timeZone);
  const diff = weekday === 0 ? -6 : 1 - weekday;
  return addDaysToDateKey(dateKey, diff, timeZone);
}

function getMinutesFromMidnight(
  iso: string,
  timeZone: string = CALENDAR_TIMEZONE,
): number {
  const { hour, minute } = getZonedParts(new Date(iso), timeZone);
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
  timeZone: string = CALENDAR_TIMEZONE,
): WeekDayColumn[] {
  const monday = getMondayOfWeek(formatDateKey(anchorDate, timeZone), timeZone);
  const columns: WeekDayColumn[] = [];

  for (let index = 0; index < 7; index++) {
    const dateKey = addDaysToDateKey(monday, index, timeZone);
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
  timeZone: string = CALENDAR_TIMEZONE,
): CalendarEvent[] {
  return sortEventsByStartAt(
    eventsForDay(events, dateKey, timeZone).filter((event) => event.allDay),
  );
}

export function getEventDayTimeRange(
  event: CalendarEvent,
  dateKey: string,
  timeZone: string = CALENDAR_TIMEZONE,
): { startMinutes: number; endMinutes: number } | null {
  const startKey = formatDateKey(new Date(event.startAt), timeZone);
  const endKey = formatDateKey(new Date(event.endAt), timeZone);

  if (dateKey < startKey || dateKey > endKey) {
    return null;
  }

  const startMinutes =
    dateKey === startKey
      ? getMinutesFromMidnight(event.startAt, timeZone)
      : 0;
  const endMinutes =
    dateKey === endKey ? getMinutesFromMidnight(event.endAt, timeZone) : 24 * 60;

  if (endMinutes <= startMinutes) {
    return null;
  }

  return { startMinutes, endMinutes };
}

export function layoutWeekTimedEvents(
  events: CalendarEvent[],
  dateKey: string,
  timeZone: string = CALENDAR_TIMEZONE,
): WeekTimedLayout[] {
  const gridStart = WEEK_GRID_START_HOUR * 60;
  const gridEnd = WEEK_GRID_END_HOUR * 60;
  const gridSpan = WEEK_GRID_TOTAL_MINUTES;

  const timed = sortEventsByStartAt(
    eventsForDay(events, dateKey, timeZone).filter((event) => !event.allDay),
  );

  const placements: Array<{
    event: CalendarEvent;
    start: number;
    end: number;
    stackIndex: number;
  }> = [];

  for (const event of timed) {
    const range = getEventDayTimeRange(event, dateKey, timeZone);
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
  timeZone: string = CALENDAR_TIMEZONE,
): boolean {
  return columns.some(
    (column) =>
      getAllDayEventsForWeekDay(events, column.dateKey, timeZone).length > 0,
  );
}
