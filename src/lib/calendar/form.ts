import { CALENDAR_TIMEZONE } from "./constants";
import { formatDateKey } from "./range";
import type { CalendarEvent, CalendarScope } from "./types";

export type CalendarFormValues = {
  scope: CalendarScope;
  title: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  location: string;
};

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

function parseTimeValue(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

function formatTimeValue(date: Date): string {
  const { hour, minute } = getZonedParts(date);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function defaultFormValues(anchorDate: Date): CalendarFormValues {
  const dateKey = formatDateKey(anchorDate);
  return {
    scope: "personal",
    title: "",
    description: "",
    startDate: dateKey,
    startTime: "10:00",
    endDate: dateKey,
    endTime: "11:00",
    allDay: false,
    location: "",
  };
}

export function eventToFormValues(event: CalendarEvent): CalendarFormValues {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);

  return {
    scope: event.scope,
    title: event.title,
    description: event.description,
    startDate: formatDateKey(start),
    startTime: formatTimeValue(start),
    endDate: formatDateKey(end),
    endTime: formatTimeValue(end),
    allDay: event.allDay,
    location: event.location,
  };
}

export function formValuesToTimestamps(values: CalendarFormValues): {
  startAt: string;
  endAt: string;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.startDate)) {
    throw new Error("Invalid start date");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.endDate)) {
    throw new Error("Invalid end date");
  }

  if (values.allDay) {
    return {
      startAt: zonedDateTimeToUtc(values.startDate, {
        hours: 0,
        minutes: 0,
        seconds: 0,
      }).toISOString(),
      endAt: zonedDateTimeToUtc(values.endDate, {
        hours: 23,
        minutes: 59,
        seconds: 59,
      }).toISOString(),
    };
  }

  const startTime = parseTimeValue(values.startTime);
  const endTime = parseTimeValue(values.endTime);
  if (!startTime || !endTime) {
    throw new Error("Invalid time");
  }

  return {
    startAt: zonedDateTimeToUtc(values.startDate, {
      hours: startTime.hours,
      minutes: startTime.minutes,
      seconds: 0,
    }).toISOString(),
    endAt: zonedDateTimeToUtc(values.endDate, {
      hours: endTime.hours,
      minutes: endTime.minutes,
      seconds: 0,
    }).toISOString(),
  };
}

export function validateFormValues(values: CalendarFormValues): string | null {
  if (!values.title.trim()) {
    return "Укажите название события";
  }

  try {
    const { startAt, endAt } = formValuesToTimestamps(values);
    if (endAt < startAt) {
      return "Окончание не может быть раньше начала";
    }
  } catch {
    return "Укажите корректные дату и время";
  }

  return null;
}

export function formValuesToCreatePayload(values: CalendarFormValues) {
  const { startAt, endAt } = formValuesToTimestamps(values);

  return {
    scope: values.scope,
    title: values.title.trim(),
    description: values.description.trim(),
    startAt,
    endAt,
    allDay: values.allDay,
    location: values.location.trim(),
  };
}

export function formValuesToUpdatePayload(values: CalendarFormValues) {
  const { startAt, endAt } = formValuesToTimestamps(values);

  return {
    title: values.title.trim(),
    description: values.description.trim(),
    startAt,
    endAt,
    allDay: values.allDay,
    location: values.location.trim(),
  };
}
