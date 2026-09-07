import { PRESENCE_ONLINE_THRESHOLD_MS } from "@/lib/presence/constants";

export type DailyActivityRecord = {
  date: string;
  firstActiveAt: string;
  lastActiveAt: string;
  onlineMs: number;
};

export type TeamMemberDailyActivity = {
  hasActivity: boolean;
  onlineMs: number;
  startedAt: string | null;
  endedAt: string | null;
};

export type ActivityPeriod = "day" | "week" | "month" | "year";

export type ActivityDayStat = {
  date: string;
  onlineMs: number;
  startedAt: string | null;
  endedAt: string | null;
};

export type ActivityMonthStat = {
  monthKey: string;
  onlineMs: number;
};

export type MemberActivityStats = {
  period: ActivityPeriod;
  onlineMs: number;
  days: ActivityDayStat[];
  months: ActivityMonthStat[];
  anchor: string;
};

/** Keep one year of per-day history. */
export const DAILY_ACTIVITY_RETENTION_DAYS = 365;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar day key in Europe/Moscow (company default). */
export function getActivityDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidActivityDayKey(value: string): boolean {
  if (!DAY_KEY_RE.test(value)) return false;
  const parsed = Date.parse(`${value}T12:00:00+03:00`);
  return !Number.isNaN(parsed) && getActivityDayKey(new Date(parsed)) === value;
}

/** Shift a Moscow YYYY-MM-DD key by whole days (MSK has no DST). */
export function shiftActivityDayKey(dayKey: string, deltaDays: number): string {
  const date = new Date(`${dayKey}T12:00:00+03:00`);
  date.setTime(date.getTime() + deltaDays * 86_400_000);
  return getActivityDayKey(date);
}

export function getActivityRetentionCutoff(now = new Date()): string {
  return shiftActivityDayKey(
    getActivityDayKey(now),
    -(DAILY_ACTIVITY_RETENTION_DAYS - 1),
  );
}

export function clampActivityAnchor(anchor: string, now = new Date()): string {
  const today = getActivityDayKey(now);
  const cutoff = getActivityRetentionCutoff(now);
  if (!isValidActivityDayKey(anchor)) return today;
  if (anchor > today) return today;
  if (anchor < cutoff) return cutoff;
  return anchor;
}

/** Monday=0 … Sunday=6 for a Moscow YYYY-MM-DD key. */
export function getActivityWeekdayMon0(dayKey: string): number {
  const utcDay = new Date(`${dayKey}T12:00:00+03:00`).getUTCDay();
  return utcDay === 0 ? 6 : utcDay - 1;
}

export function getMondayOfActivityWeek(dayKey: string): string {
  return shiftActivityDayKey(dayKey, -getActivityWeekdayMon0(dayKey));
}

export function listActivityMonthDayKeys(dayKey: string): string[] {
  const [yearRaw, monthRaw] = dayKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const first = `${yearRaw}-${monthRaw}-01`;
  const nextMonth =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const last = shiftActivityDayKey(nextMonth, -1);
  const keys: string[] = [];
  for (
    let cursor = first;
    cursor <= last;
    cursor = shiftActivityDayKey(cursor, 1)
  ) {
    keys.push(cursor);
  }
  return keys;
}

export function shiftActivityPeriodAnchor(
  period: ActivityPeriod,
  anchor: string,
  delta: number,
): string {
  if (period === "day") return shiftActivityDayKey(anchor, delta);
  if (period === "week") return shiftActivityDayKey(anchor, delta * 7);
  if (period === "year") {
    const year = Number(anchor.slice(0, 4)) + delta;
    return `${year}${anchor.slice(4)}`;
  }
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  const day = Number(anchor.slice(8, 10));
  let nextYear = year;
  let nextMonth = month + delta;
  while (nextMonth < 1) {
    nextMonth += 12;
    nextYear -= 1;
  }
  while (nextMonth > 12) {
    nextMonth -= 12;
    nextYear += 1;
  }
  const monthKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
  const daysInMonth = listActivityMonthDayKeys(`${monthKey}-01`).length;
  const safeDay = Math.min(day, daysInMonth);
  return `${monthKey}-${String(safeDay).padStart(2, "0")}`;
}

/** Calendar-aligned ranges for the given anchor day. */
export function listActivityDayKeys(
  period: ActivityPeriod,
  now = new Date(),
  anchorDayKey?: string,
): string[] {
  const anchor = clampActivityAnchor(
    anchorDayKey ?? getActivityDayKey(now),
    now,
  );
  if (period === "day") return [anchor];
  if (period === "week") {
    const monday = getMondayOfActivityWeek(anchor);
    return Array.from({ length: 7 }, (_, index) =>
      shiftActivityDayKey(monday, index),
    );
  }
  if (period === "month") return listActivityMonthDayKeys(anchor);
  return [];
}

export function buildActivityYearMonths(
  byDate: Record<string, DailyActivityRecord>,
  year: number,
): ActivityMonthStat[] {
  return Array.from({ length: 12 }, (_, index) => {
    const monthKey = `${year}-${String(index + 1).padStart(2, "0")}`;
    const days = listActivityMonthDayKeys(`${monthKey}-01`);
    const onlineMs = days.reduce(
      (sum, date) => sum + (byDate[date]?.onlineMs ?? 0),
      0,
    );
    return { monthKey, onlineMs };
  });
}

/** Pad month days into a Mon–Sun grid (null = outside month). */
export function buildActivityCalendarCells(
  days: ActivityDayStat[],
  period: ActivityPeriod,
): Array<ActivityDayStat | null> {
  if (period !== "month") return days;
  if (days.length === 0) return [];
  const lead = getActivityWeekdayMon0(days[0]!.date);
  const cells: Array<ActivityDayStat | null> = [
    ...Array.from({ length: lead }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function applyHeartbeatToDailyActivity(
  existing: DailyActivityRecord | null | undefined,
  nowIso: string,
  options?: {
    dayKey?: string;
    onlineThresholdMs?: number;
  },
): DailyActivityRecord {
  const nowMs = Date.parse(nowIso);
  const dayKey = options?.dayKey ?? getActivityDayKey(new Date(nowMs));
  const threshold =
    options?.onlineThresholdMs ?? PRESENCE_ONLINE_THRESHOLD_MS;

  if (!existing || existing.date !== dayKey) {
    return {
      date: dayKey,
      firstActiveAt: nowIso,
      lastActiveAt: nowIso,
      onlineMs: 0,
    };
  }

  const lastMs = Date.parse(existing.lastActiveAt);
  let onlineMs = existing.onlineMs;
  if (!Number.isNaN(lastMs) && nowMs > lastMs) {
    const gap = nowMs - lastMs;
    if (gap <= threshold) {
      onlineMs += gap;
    }
  }

  return {
    date: dayKey,
    firstActiveAt: existing.firstActiveAt,
    lastActiveAt: nowIso,
    onlineMs,
  };
}

export function toTeamMemberDailyActivity(
  record: DailyActivityRecord | null | undefined,
  dayKey = getActivityDayKey(),
): TeamMemberDailyActivity {
  if (!record || record.date !== dayKey) {
    return {
      hasActivity: false,
      onlineMs: 0,
      startedAt: null,
      endedAt: null,
    };
  }
  return {
    hasActivity: true,
    onlineMs: record.onlineMs,
    startedAt: record.firstActiveAt,
    endedAt: record.lastActiveAt,
  };
}

export function pruneActivityDays(
  byDate: Record<string, DailyActivityRecord>,
  retentionDays = DAILY_ACTIVITY_RETENTION_DAYS,
  now = new Date(),
): Record<string, DailyActivityRecord> {
  const cutoff = shiftActivityDayKey(getActivityDayKey(now), -(retentionDays - 1));
  const next: Record<string, DailyActivityRecord> = {};
  for (const [date, record] of Object.entries(byDate)) {
    if (date >= cutoff) {
      next[date] = record;
    }
  }
  return next;
}

export function buildMemberActivityStats(
  byDate: Record<string, DailyActivityRecord>,
  period: ActivityPeriod,
  now = new Date(),
  anchorDayKey?: string,
): MemberActivityStats {
  const anchor = clampActivityAnchor(
    anchorDayKey ?? getActivityDayKey(now),
    now,
  );

  if (period === "year") {
    const year = Number(anchor.slice(0, 4));
    const months = buildActivityYearMonths(byDate, year);
    return {
      period,
      onlineMs: months.reduce((sum, month) => sum + month.onlineMs, 0),
      days: [],
      months,
      anchor,
    };
  }

  const keys = listActivityDayKeys(period, now, anchor);
  const days: ActivityDayStat[] = keys.map((date) => {
    const record = byDate[date];
    if (!record) {
      return {
        date,
        onlineMs: 0,
        startedAt: null,
        endedAt: null,
      };
    }
    return {
      date: record.date,
      onlineMs: record.onlineMs,
      startedAt: record.firstActiveAt,
      endedAt: record.lastActiveAt,
    };
  });

  return {
    period,
    onlineMs: days.reduce((sum, day) => sum + day.onlineMs, 0),
    days,
    months: [],
    anchor,
  };
}

function isDailyRecord(value: unknown): value is DailyActivityRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.date === "string" &&
    typeof row.firstActiveAt === "string" &&
    typeof row.lastActiveAt === "string" &&
    typeof row.onlineMs === "number"
  );
}

export type DailyActivityStoreShape = {
  byUser: Record<string, Record<string, DailyActivityRecord>>;
};

/** Migrate legacy `{ byUser: { id: DailyActivityRecord } }` to per-day maps. */
export function normalizeDailyActivityStore(
  raw: unknown,
): DailyActivityStoreShape {
  if (!raw || typeof raw !== "object") return { byUser: {} };
  const byUserRaw = (raw as { byUser?: unknown }).byUser;
  if (!byUserRaw || typeof byUserRaw !== "object") return { byUser: {} };

  const byUser: Record<string, Record<string, DailyActivityRecord>> = {};
  for (const [userId, entry] of Object.entries(
    byUserRaw as Record<string, unknown>,
  )) {
    if (isDailyRecord(entry)) {
      byUser[userId] = { [entry.date]: entry };
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const dayMap: Record<string, DailyActivityRecord> = {};
    for (const [date, record] of Object.entries(
      entry as Record<string, unknown>,
    )) {
      if (isDailyRecord(record)) {
        dayMap[date] = record;
      }
    }
    byUser[userId] = dayMap;
  }
  return { byUser };
}
