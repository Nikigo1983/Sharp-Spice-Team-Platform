import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PRESENCE_ONLINE_THRESHOLD_MS } from "@/lib/presence/constants";
import type { PresenceMap, UserPresence } from "@/lib/presence/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbPresence from "@/lib/supabase/presence-repo";

const STORE_PATH = path.join(process.cwd(), ".data", "user-presence.json");

type PresenceStore = {
  users: Record<string, { lastActiveAt: string }>;
};

async function readStore(): Promise<PresenceStore> {
  if (isSupabaseConfigured()) {
    try {
      return { users: await sbPresence.sbListUserPresence() };
    } catch (error) {
      console.error("[presence] supabase read", error);
      return { users: {} };
    }
  }

  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as PresenceStore;
    if (!data?.users || typeof data.users !== "object") {
      return { users: {} };
    }
    return data;
  } catch {
    return { users: {} };
  }
}

async function writeStore(store: PresenceStore): Promise<void> {
  if (isSupabaseConfigured()) {
    return;
  }
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function isUserOnline(
  lastActiveAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastActiveAt) return false;
  const ts = Date.parse(lastActiveAt);
  if (Number.isNaN(ts)) return false;
  return now - ts < PRESENCE_ONLINE_THRESHOLD_MS;
}

export async function touchUserPresence(userId: string): Promise<string> {
  const lastActiveAt = new Date().toISOString();

  if (isSupabaseConfigured()) {
    await sbPresence.sbUpsertUserPresence(userId, lastActiveAt);
    return lastActiveAt;
  }

  const store = await readStore();
  store.users[userId] = { lastActiveAt };
  await writeStore(store);
  return lastActiveAt;
}

export async function getPresenceMap(
  userIds: string[],
): Promise<PresenceMap> {
  const store = await readStore();
  const now = Date.now();
  const map: PresenceMap = {};

  for (const userId of userIds) {
    const lastActiveAt = store.users[userId]?.lastActiveAt ?? null;
    map[userId] = {
      userId,
      lastActiveAt: lastActiveAt ?? "",
      isOnline: isUserOnline(lastActiveAt, now),
    };
  }

  return map;
}
