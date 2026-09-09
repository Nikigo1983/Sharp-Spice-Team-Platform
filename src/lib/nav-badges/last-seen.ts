import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAppState, setAppState } from "@/lib/supabase/app-state";
import type { NavBadgeHref } from "./types";

const STORE_PATH = path.join(process.cwd(), ".data", "nav-section-last-seen.json");
const APP_STATE_KEY = "nav_section_last_seen";

type LastSeenStore = {
  users: Record<string, Partial<Record<NavBadgeHref, string>>>;
};

async function readFileStore(): Promise<LastSeenStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as LastSeenStore;
    if (!data.users || typeof data.users !== "object") return { users: {} };
    return data;
  } catch {
    return { users: {} };
  }
}

async function writeFileStore(store: LastSeenStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function readStore(): Promise<LastSeenStore> {
  if (isSupabaseConfigured()) {
    try {
      const remote = await getAppState<LastSeenStore>(APP_STATE_KEY);
      if (remote?.users) return remote;
    } catch (error) {
      console.error("[nav-badges] last-seen supabase read", error);
    }
  }
  return readFileStore();
}

async function writeStore(store: LastSeenStore): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await setAppState(APP_STATE_KEY, store);
      return;
    } catch (error) {
      console.error("[nav-badges] last-seen supabase write", error);
    }
  }
  await writeFileStore(store);
}

export async function getNavSectionLastSeen(
  userId: string,
  href: NavBadgeHref,
): Promise<string | null> {
  const store = await readStore();
  return store.users[userId]?.[href] ?? null;
}

export async function setNavSectionLastSeen(
  userId: string,
  href: NavBadgeHref,
  at: string = new Date().toISOString(),
): Promise<void> {
  const store = await readStore();
  const current = store.users[userId] ?? {};
  store.users[userId] = { ...current, [href]: at };
  await writeStore(store);
}
