import "server-only";

import { getSupabaseAdmin } from "./server";
import type { WorkspaceChatTurn } from "@/lib/ai/workspace-assistant";
import {
  MAX_WORKSPACE_CHATS,
  type WorkspaceChatSession,
} from "@/lib/ai/workspace-chat-types";

type ChatRow = {
  id: string;
  user_id: string;
  title: string;
  messages: WorkspaceChatTurn[];
  created_at: string;
  updated_at: string;
};

function mapSession(row: ChatRow): WorkspaceChatSession {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: Array.isArray(row.messages) ? row.messages : [],
  };
}

export async function sbListWorkspaceChatSessions(
  userId: string,
): Promise<WorkspaceChatSession[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("ai_workspace_chats")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_WORKSPACE_CHATS);

  if (error) throw error;
  return (data as ChatRow[]).map(mapSession);
}

export async function sbGetWorkspaceChatSession(
  userId: string,
  chatId: string,
): Promise<WorkspaceChatSession | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ai_workspace_chats")
    .select("*")
    .eq("user_id", userId)
    .eq("id", chatId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapSession(data as ChatRow) : null;
}

export async function sbInsertWorkspaceChatSession(
  userId: string,
  session: WorkspaceChatSession,
): Promise<WorkspaceChatSession> {
  const { data, error } = await getSupabaseAdmin()
    .from("ai_workspace_chats")
    .insert({
      id: session.id,
      user_id: userId,
      title: session.title,
      messages: session.messages,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapSession(data as ChatRow);
}

export async function sbUpdateWorkspaceChatSession(
  userId: string,
  session: WorkspaceChatSession,
): Promise<WorkspaceChatSession> {
  const { data, error } = await getSupabaseAdmin()
    .from("ai_workspace_chats")
    .update({
      title: session.title,
      messages: session.messages,
      updated_at: session.updatedAt,
    })
    .eq("user_id", userId)
    .eq("id", session.id)
    .select("*")
    .single();

  if (error) throw error;
  return mapSession(data as ChatRow);
}

export async function sbDeleteWorkspaceChatSession(
  userId: string,
  chatId: string,
): Promise<boolean> {
  const { error, count } = await getSupabaseAdmin()
    .from("ai_workspace_chats")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", chatId);

  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function sbTrimWorkspaceChats(userId: string): Promise<void> {
  const sessions = await sbListWorkspaceChatSessions(userId);
  if (sessions.length <= MAX_WORKSPACE_CHATS) return;

  const toDelete = sessions.slice(MAX_WORKSPACE_CHATS);
  for (const session of toDelete) {
    await sbDeleteWorkspaceChatSession(userId, session.id);
  }
}
