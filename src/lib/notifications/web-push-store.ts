import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAppState, setAppState } from "@/lib/supabase/app-state";

export type PushSubscriptionRecord = {
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  updatedAt: string;
};

type PushStore = {
  subscriptions: PushSubscriptionRecord[];
};

const STORE_PATH = path.join(process.cwd(), ".data", "push-subscriptions.json");
const APP_STATE_KEY = "push_subscriptions_v1";

async function readFileStore(): Promise<PushStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as PushStore;
    if (!Array.isArray(data.subscriptions)) return { subscriptions: [] };
    return data;
  } catch {
    return { subscriptions: [] };
  }
}

async function writeFileStore(store: PushStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function readStore(): Promise<PushStore> {
  if (isSupabaseConfigured()) {
    try {
      const value = await getAppState<PushStore>(APP_STATE_KEY);
      if (value && Array.isArray(value.subscriptions)) return value;
    } catch (error) {
      console.error("[web-push] read store", error);
    }
  }
  return readFileStore();
}

async function writeStore(store: PushStore): Promise<void> {
  if (isSupabaseConfigured()) {
    const ok = await setAppState(APP_STATE_KEY, store);
    if (ok) return;
  }
  await writeFileStore(store);
}

export async function savePushSubscription(
  record: Omit<PushSubscriptionRecord, "updatedAt">,
): Promise<void> {
  const store = await readStore();
  const next: PushSubscriptionRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
  };
  const withoutSameEndpoint = store.subscriptions.filter(
    (item) => item.endpoint !== record.endpoint,
  );
  withoutSameEndpoint.push(next);
  // Keep last 20 endpoints per user (multi-device).
  const byUser = withoutSameEndpoint.filter(
    (item) => item.userId === record.userId,
  );
  const others = withoutSameEndpoint.filter(
    (item) => item.userId !== record.userId,
  );
  const kept = byUser
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
  await writeStore({ subscriptions: [...others, ...kept] });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const store = await readStore();
  await writeStore({
    subscriptions: store.subscriptions.filter(
      (item) => item.endpoint !== endpoint,
    ),
  });
}

export async function listPushSubscriptionsForUser(
  userId: string,
): Promise<PushSubscriptionRecord[]> {
  const store = await readStore();
  return store.subscriptions.filter((item) => item.userId === userId);
}
