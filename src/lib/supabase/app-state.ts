import "server-only";

import { getSupabaseAdmin } from "./server";

export async function getAppState<T>(key: string): Promise<T | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error("[supabase] getAppState", key, error.message);
    return null;
  }

  return (data?.value as T | undefined) ?? null;
}

export async function setAppState<T>(key: string, value: T): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("app_state").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    console.error("[supabase] setAppState", key, error.message);
    return false;
  }

  return true;
}
