import "server-only";

import { getSupabaseAdmin } from "./server";
import type { TeamChatMessage } from "@/lib/team-chat/types";

type MessageRow = {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  message_type?: string | null;
  message_text: string;
  audio_url?: string | null;
  audio_duration_ms?: number | null;
  image_url?: string | null;
  created_at: string;
  updated_at: string;
};

function mapMessage(row: MessageRow): TeamChatMessage {
  const messageType =
    row.message_type === "voice"
      ? "voice"
      : row.message_type === "image"
        ? "image"
        : "text";
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name,
    user_role: row.user_role as TeamChatMessage["user_role"],
    message_type: messageType,
    message_text: row.message_text,
    audio_url: row.audio_url ?? null,
    audio_duration_ms: row.audio_duration_ms ?? null,
    image_url: row.image_url ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function sbListAllTeamChatMessages(): Promise<TeamChatMessage[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("team_chat_messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as MessageRow[]).map(mapMessage);
}

export async function sbInsertTeamChatMessage(
  message: TeamChatMessage,
): Promise<TeamChatMessage> {
  const { data, error } = await getSupabaseAdmin()
    .from("team_chat_messages")
    .insert({
      id: message.id,
      user_id: message.user_id,
      user_name: message.user_name,
      user_role: message.user_role,
      message_type: message.message_type,
      message_text: message.message_text,
      audio_url: message.audio_url,
      audio_duration_ms: message.audio_duration_ms,
      image_url: message.image_url,
      created_at: message.created_at,
      updated_at: message.updated_at,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapMessage(data as MessageRow);
}

export async function sbDeleteTeamChatMessage(id: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("team_chat_messages")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}

export async function sbClearTeamChatMessages(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data, error: selectError } = await supabase
    .from("team_chat_messages")
    .select("id");

  if (selectError) throw selectError;

  const ids = (data ?? []).map((row) => row.id as string);
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("team_chat_messages")
    .delete()
    .in("id", ids);

  if (error) throw error;
}

export async function sbGetTeamChatLastSeen(
  userId: string,
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("team_chat_last_seen")
    .select("last_seen_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.last_seen_at ?? null;
}

export async function sbSetTeamChatLastSeen(
  userId: string,
  lastSeenAt: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("team_chat_last_seen").upsert(
    {
      user_id: userId,
      last_seen_at: lastSeenAt,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}
