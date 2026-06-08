export type PeriodPreset =
  | "current_month"
  | "prev_month"
  | "current_quarter"
  | "half_year"
  | "nine_months"
  | "calendar_year"
  | "custom";

export type DateRange = {
  from: Date;
  to: Date;
  preset: PeriodPreset;
  label: string;
};

export const PERIOD_PRESETS: Array<{
  id: PeriodPreset;
  label: string;
}> = [
  { id: "current_month", label: "Текущий месяц" },
  { id: "prev_month", label: "Прошлый месяц" },
  { id: "current_quarter", label: "Текущий квартал" },
  { id: "half_year", label: "Полугодие" },
  { id: "nine_months", label: "9 месяцев" },
  { id: "calendar_year", label: "Календарный год" },
  { id: "custom", label: "Произвольный период" },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return startOfDay(new Date(d.getFullYear(), q, 1));
}

function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return endOfDay(new Date(d.getFullYear(), q + 3, 0));
}

export function resolvePeriodRange(
  preset: PeriodPreset,
  customFrom?: string,
  customTo?: string,
  now = new Date(),
): DateRange {
  const today = startOfDay(now);

  if (preset === "custom" && customFrom && customTo) {
    const from = startOfDay(new Date(customFrom));
    const to = endOfDay(new Date(customTo));
    return {
      from,
      to,
      preset,
      label: `${formatRuDate(from)} — ${formatRuDate(to)}`,
    };
  }

  switch (preset) {
    case "prev_month": {
      const from = startOfMonth(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      const to = endOfMonth(from);
      return { from, to, preset, label: "Прошлый месяц" };
    }
    case "current_quarter": {
      const from = startOfQuarter(today);
      const to = endOfQuarter(today);
      return { from, to, preset, label: "Текущий квартал" };
    }
    case "half_year": {
      const from = startOfDay(new Date(today.getFullYear(), today.getMonth() - 5, 1));
      const to = endOfDay(today);
      return { from, to, preset, label: "Полугодие" };
    }
    case "nine_months": {
      const from = startOfDay(new Date(today.getFullYear(), today.getMonth() - 8, 1));
      const to = endOfDay(today);
      return { from, to, preset, label: "9 месяцев" };
    }
    case "calendar_year": {
      const from = startOfDay(new Date(today.getFullYear(), 0, 1));
      const to = endOfDay(today);
      return { from, to, preset, label: "Календарный год" };
    }
    case "current_month":
    default: {
      const from = startOfMonth(today);
      const to = endOfMonth(today);
      return { from, to, preset: "current_month", label: "Текущий месяц" };
    }
  }
}

export function formatRuDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function isInRange(date: Date | null, range: DateRange): boolean {
  if (!date) return false;
  return date >= range.from && date <= range.to;
}

export function monthKeysInRange(range: DateRange): string[] {
  const keys: string[] = [];
  const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
  const end = new Date(range.to.getFullYear(), range.to.getMonth(), 1);
  while (cursor <= end) {
    keys.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

/** Минимум 6 месяцев для графиков — чтобы не было одной колонки на весь экран */
export function chartMonthKeys(range: DateRange, minMonths = 6): string[] {
  const inRange = monthKeysInRange(range);
  if (inRange.length >= minMonths) return inRange;

  const end = new Date(range.to.getFullYear(), range.to.getMonth(), 1);
  const keys: string[] = [];
  for (let i = minMonths - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return keys;
}

export function formatMonthKey(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}
