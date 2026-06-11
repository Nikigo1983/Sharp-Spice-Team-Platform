import "server-only";

import { getSupabaseAdmin } from "./server";

type PresenceRow = {
  user_id: string;
  last_active_at: string;
};

export async function sbUpsertUserPresence(
  userId: string,
  lastActiveAt: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("user_presence").upsert(
    {
      user_id: userId,
      last_active_at: lastActiveAt,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

export async function sbListUserPresence(): Promise<
  Record<string, { lastActiveAt: string }>
> {
  const { data, error } = await getSupabaseAdmin()
    .from("user_presence")
    .select("user_id, last_active_at");

  if (error) throw error;

  const map: Record<string, { lastActiveAt: string }> = {};
  for (const row of (data ?? []) as PresenceRow[]) {
    map[row.user_id] = { lastActiveAt: row.last_active_at };
  }
  return map;
}
