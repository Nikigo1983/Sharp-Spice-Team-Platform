export const CALENDAR_MONTHS_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

export type DateKeyParts = {
  year: number;
  month: number;
  day: number;
};

export type TimeParts = {
  hours: number;
  minutes: number;
};

export function parseDateKey(value: string): DateKeyParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return null;
  }

  return { year, month, day };
}

export function buildDateKey(parts: DateKeyParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatDateKeyRu(value: string): string {
  const parts = parseDateKey(value);
  if (!parts) {
    return value;
  }

  return `${String(parts.day).padStart(2, "0")}.${String(parts.month).padStart(2, "0")}.${parts.year}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function parseTimeParts(value: string): TimeParts | null {
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

export function buildTimeValue(parts: TimeParts): string {
  return `${String(parts.hours).padStart(2, "0")}:${String(parts.minutes).padStart(2, "0")}`;
}

export function formatTimeValueRu(value: string): string {
  const parts = parseTimeParts(value);
  if (!parts) {
    return value;
  }

  return buildTimeValue(parts);
}

export function buildYearOptions(anchorYear: number, span = 3): number[] {
  const years: number[] = [];
  for (let year = anchorYear - span; year <= anchorYear + span; year++) {
    years.push(year);
  }
  return years;
}

export function buildMinuteOptions(step = 5): number[] {
  const minutes: number[] = [];
  for (let minute = 0; minute < 60; minute += step) {
    minutes.push(minute);
  }
  return minutes;
}

export function snapMinuteToStep(minute: number, step = 5): number {
  return Math.min(59, Math.round(minute / step) * step);
}
