import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { listTeamUsers } from "@/lib/auth/users";
import type { SessionUser } from "@/lib/auth/types";
import { getAppState, setAppState } from "@/lib/supabase/app-state";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { canDeleteTeamMember } from "./permissions";
import type { TeamMember } from "./types";

const STORE_PATH = path.join(process.cwd(), ".data", "team-deleted-users.json");
const APP_STATE_KEY = "team_deleted_user_ids";

type DeletedUsersStore = {
  userIds: string[];
};

const DEFAULT_STORE: DeletedUsersStore = { userIds: [] };

async function readStoreFromFile(): Promise<DeletedUsersStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as DeletedUsersStore;
    if (!Array.isArray(data.userIds)) {
      return DEFAULT_STORE;
    }
    return data;
  } catch {
    return DEFAULT_STORE;
  }
}

async function writeStoreToFile(store: DeletedUsersStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function readStore(): Promise<DeletedUsersStore> {
  if (isSupabaseConfigured()) {
    try {
      const value = await getAppState<DeletedUsersStore>(APP_STATE_KEY);
      return value ?? DEFAULT_STORE;
    } catch (error) {
      console.error("[team] supabase read", error);
      return DEFAULT_STORE;
    }
  }
  return readStoreFromFile();
}

async function writeStore(store: DeletedUsersStore): Promise<boolean> {
  if (isSupabaseConfigured()) {
    return setAppState(APP_STATE_KEY, store);
  }
  try {
    await writeStoreToFile(store);
    return true;
  } catch (error) {
    console.error("[team] file write", error);
    return false;
  }
}

export async function getDeletedUserIds(): Promise<string[]> {
  const store = await readStore();
  return store.userIds;
}

export async function isUserDeleted(userId: string): Promise<boolean> {
  const ids = await getDeletedUserIds();
  return ids.includes(userId);
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  const deleted = new Set(await getDeletedUserIds());
  return listTeamUsers()
    .filter((user) => !deleted.has(user.id))
    .map(({ id, email, name, role }) => ({ id, email, name, role }));
}

export async function deleteTeamMember(
  actor: SessionUser,
  targetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canDeleteTeamMember(actor, targetId)) {
    return { ok: false, error: "Недостаточно прав для удаления этого пользователя." };
  }

  const target = listTeamUsers().find((user) => user.id === targetId);
  if (!target) {
    return { ok: false, error: "Пользователь не найден." };
  }

  const store = await readStore();
  if (store.userIds.includes(targetId)) {
    return { ok: false, error: "Пользователь уже удалён." };
  }

  const saved = await writeStore({
    userIds: [...store.userIds, targetId],
  });

  if (!saved) {
    return { ok: false, error: "Не удалось сохранить изменения." };
  }

  return { ok: true };
}
