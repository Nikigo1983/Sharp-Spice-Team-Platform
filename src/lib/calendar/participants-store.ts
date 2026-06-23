import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbParticipants from "@/lib/supabase/calendar-event-participants-repo";

const STORE_PATH = path.join(
  process.cwd(),
  ".data",
  "calendar-event-participants.json",
);

type ParticipantStore = {
  rows: { eventId: string; userId: string }[];
};

async function readStore(): Promise<ParticipantStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as ParticipantStore;
    if (!Array.isArray(data.rows)) {
      return { rows: [] };
    }
    return data;
  } catch {
    return { rows: [] };
  }
}

async function writeStore(store: ParticipantStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function listParticipantUserIdsByEventIds(
  eventIds: string[],
): Promise<Map<string, string[]>> {
  if (eventIds.length === 0) {
    return new Map();
  }

  if (isSupabaseConfigured()) {
    return sbParticipants.sbListParticipantUserIdsByEventIds(eventIds);
  }

  const store = await readStore();
  const map = new Map<string, string[]>();

  for (const eventId of eventIds) {
    const userIds = store.rows
      .filter((row) => row.eventId === eventId)
      .map((row) => row.userId);
    map.set(eventId, [...new Set(userIds)].sort());
  }

  return map;
}

export async function replaceEventParticipants(
  eventId: string,
  userIds: string[],
): Promise<void> {
  if (isSupabaseConfigured()) {
    await sbParticipants.sbReplaceEventParticipants(eventId, userIds);
    return;
  }

  const store = await readStore();
  store.rows = store.rows.filter((row) => row.eventId !== eventId);

  for (const userId of userIds) {
    store.rows.push({ eventId, userId });
  }

  await writeStore(store);
}
