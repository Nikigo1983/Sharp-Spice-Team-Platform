import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAppState, setAppState } from "@/lib/supabase/app-state";

const STORE_PATH = path.join(
  process.cwd(),
  ".data",
  "staff-case-notes-last-seen.json",
);
const APP_STATE_KEY = "staff_case_notes_last_seen";

/** userId → questionnaireId → ISO last-seen timestamp */
type NotesLastSeenStore = {
  users: Record<string, Record<string, string>>;
};

async function readFileStore(): Promise<NotesLastSeenStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as NotesLastSeenStore;
    if (!data.users || typeof data.users !== "object") return { users: {} };
    return data;
  } catch {
    return { users: {} };
  }
}

async function writeFileStore(store: NotesLastSeenStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function readStore(): Promise<NotesLastSeenStore> {
  if (isSupabaseConfigured()) {
    try {
      const remote = await getAppState<NotesLastSeenStore>(APP_STATE_KEY);
      if (remote?.users) return remote;
    } catch (error) {
      console.error("[staff-notes] last-seen supabase read", error);
    }
  }
  return readFileStore();
}

async function writeStore(store: NotesLastSeenStore): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await setAppState(APP_STATE_KEY, store);
      return;
    } catch (error) {
      console.error("[staff-notes] last-seen supabase write", error);
    }
  }
  await writeFileStore(store);
}

export async function getStaffCaseNotesLastSeen(
  userId: string,
  questionnaireId: string,
): Promise<string | null> {
  const uid = userId.trim();
  const qid = questionnaireId.trim();
  if (!uid || !qid) return null;
  const store = await readStore();
  return store.users[uid]?.[qid] ?? null;
}

/** All last-seen timestamps for one staff user (questionnaireId → ISO). */
export async function getStaffCaseNotesLastSeenMap(
  userId: string,
): Promise<Record<string, string>> {
  const uid = userId.trim();
  if (!uid) return {};
  const store = await readStore();
  return { ...(store.users[uid] ?? {}) };
}

export async function setStaffCaseNotesLastSeen(
  userId: string,
  questionnaireId: string,
  at: string = new Date().toISOString(),
): Promise<void> {
  const uid = userId.trim();
  const qid = questionnaireId.trim();
  if (!uid || !qid) return;
  const store = await readStore();
  const current = store.users[uid] ?? {};
  store.users[uid] = { ...current, [qid]: at };
  await writeStore(store);
}
