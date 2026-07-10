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
  file_url?: string | null;
  file_name?: string | null;
  file_content_type?: string | null;
  file_size?: number | null;
  reply_to_message_id?: string | null;
  reply_to_user_name?: string | null;
  reply_to_message_type?: string | null;
  reply_to_preview?: string | null;
  is_pinned?: boolean | null;
  pinned_at?: string | null;
  pinned_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

function mapMessageType(value: string | null | undefined): TeamChatMessage["message_type"] {
  if (value === "voice") return "voice";
  if (value === "image") return "image";
  if (value === "file") return "file";
  return "text";
}

function mapMessage(row: MessageRow): TeamChatMessage {
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name,
    user_role: row.user_role as TeamChatMessage["user_role"],
    message_type: mapMessageType(row.message_type),
    message_text: row.message_text,
    audio_url: row.audio_url ?? null,
    audio_duration_ms: row.audio_duration_ms ?? null,
    image_url: row.image_url ?? null,
    file_url: row.file_url ?? null,
    file_name: row.file_name ?? null,
    file_content_type: row.file_content_type ?? null,
    file_size: row.file_size ?? null,
    reply_to_message_id: row.reply_to_message_id ?? null,
    reply_to_user_name: row.reply_to_user_name ?? null,
    reply_to_message_type: row.reply_to_message_type
      ? mapMessageType(row.reply_to_message_type)
      : null,
    reply_to_preview: row.reply_to_preview ?? null,
    is_pinned: Boolean(row.is_pinned),
    pinned_at: row.pinned_at ?? null,
    pinned_by_user_id: row.pinned_by_user_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function messageInsertPayload(message: TeamChatMessage) {
  return {
    id: message.id,
    user_id: message.user_id,
    user_name: message.user_name,
    user_role: message.user_role,
    message_type: message.message_type,
    message_text: message.message_text,
    audio_url: message.audio_url,
    audio_duration_ms: message.audio_duration_ms,
    image_url: message.image_url,
    file_url: message.file_url,
    file_name: message.file_name,
    file_content_type: message.file_content_type,
    file_size: message.file_size,
    reply_to_message_id: message.reply_to_message_id,
    reply_to_user_name: message.reply_to_user_name,
    reply_to_message_type: message.reply_to_message_type,
    reply_to_preview: message.reply_to_preview,
    is_pinned: message.is_pinned,
    pinned_at: message.pinned_at,
    pinned_by_user_id: message.pinned_by_user_id,
    created_at: message.created_at,
    updated_at: message.updated_at,
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

export async function sbGetTeamChatMessage(
  id: string,
): Promise<TeamChatMessage | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("team_chat_messages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapMessage(data as MessageRow) : null;
}

export async function sbInsertTeamChatMessage(
  message: TeamChatMessage,
): Promise<TeamChatMessage> {
  const { data, error } = await getSupabaseAdmin()
    .from("team_chat_messages")
    .insert(messageInsertPayload(message))
    .select("*")
    .single();

  if (error) throw error;
  return mapMessage(data as MessageRow);
}

export async function sbUpdateTeamChatMessagePin(
  id: string,
  pinned: boolean,
  pinnedByUserId: string | null,
  pinnedAt: string | null,
  updatedAt: string,
): Promise<TeamChatMessage | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("team_chat_messages")
    .update({
      is_pinned: pinned,
      pinned_by_user_id: pinnedByUserId,
      pinned_at: pinnedAt,
      updated_at: updatedAt,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? mapMessage(data as MessageRow) : null;
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
