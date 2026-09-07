import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyHeartbeatToDailyActivity,
  buildMemberActivityStats,
  getActivityDayKey,
  normalizeDailyActivityStore,
  pruneActivityDays,
  toTeamMemberDailyActivity,
  type ActivityPeriod,
  type DailyActivityRecord,
  type MemberActivityStats,
  type TeamMemberDailyActivity,
} from "@/lib/presence/daily-activity-logic";
import { getAppState, setAppState } from "@/lib/supabase/app-state";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type {
  ActivityMonthStat,
  ActivityPeriod,
  DailyActivityRecord,
  MemberActivityStats,
  TeamMemberDailyActivity,
} from "@/lib/presence/daily-activity-logic";
export {
  applyHeartbeatToDailyActivity,
  buildActivityCalendarCells,
  buildMemberActivityStats,
  clampActivityAnchor,
  getActivityDayKey,
  getActivityRetentionCutoff,
  isValidActivityDayKey,
  listActivityDayKeys,
  normalizeDailyActivityStore,
  shiftActivityPeriodAnchor,
  toTeamMemberDailyActivity,
} from "@/lib/presence/daily-activity-logic";

const STORE_PATH = path.join(process.cwd(), ".data", "user-presence-daily.json");
const APP_STATE_KEY = "user_presence_daily";

type UserDayMap = Record<string, DailyActivityRecord>;

type DailyActivityStore = {
  byUser: Record<string, UserDayMap>;
};

const EMPTY_STORE: DailyActivityStore = { byUser: {} };

async function readFileStore(): Promise<DailyActivityStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return normalizeDailyActivityStore(JSON.parse(raw));
  } catch {
    return EMPTY_STORE;
  }
}

async function writeFileStore(store: DailyActivityStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function readStore(): Promise<DailyActivityStore> {
  if (isSupabaseConfigured()) {
    try {
      const value = await getAppState<unknown>(APP_STATE_KEY);
      return normalizeDailyActivityStore(value);
    } catch (error) {
      console.error("[presence/daily] supabase read", error);
      return EMPTY_STORE;
    }
  }
  return readFileStore();
}

async function writeStore(store: DailyActivityStore): Promise<boolean> {
  if (isSupabaseConfigured()) {
    return setAppState(APP_STATE_KEY, store);
  }
  try {
    await writeFileStore(store);
    return true;
  } catch (error) {
    console.error("[presence/daily] file write", error);
    return false;
  }
}

export async function recordDailyPresenceHeartbeat(
  userId: string,
  lastActiveAt = new Date().toISOString(),
): Promise<DailyActivityRecord> {
  const store = await readStore();
  const dayKey = getActivityDayKey(new Date(Date.parse(lastActiveAt)));
  const userDays = store.byUser[userId] ?? {};
  const next = applyHeartbeatToDailyActivity(userDays[dayKey], lastActiveAt, {
    dayKey,
  });
  userDays[dayKey] = next;
  store.byUser[userId] = pruneActivityDays(userDays);
  await writeStore(store);
  return next;
}

export async function getDailyActivityMap(
  userIds: string[],
): Promise<Record<string, TeamMemberDailyActivity>> {
  const store = await readStore();
  const dayKey = getActivityDayKey();
  const map: Record<string, TeamMemberDailyActivity> = {};
  for (const userId of userIds) {
    map[userId] = toTeamMemberDailyActivity(
      store.byUser[userId]?.[dayKey],
      dayKey,
    );
  }
  return map;
}

export async function getMemberActivityStats(
  userId: string,
  period: ActivityPeriod,
  anchorDayKey?: string,
): Promise<MemberActivityStats> {
  const store = await readStore();
  return buildMemberActivityStats(
    store.byUser[userId] ?? {},
    period,
    new Date(),
    anchorDayKey,
  );
}
