import "server-only";

import { getSupabaseAdmin } from "./server";
import type { Notification } from "@/lib/notifications/types";

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  author_name: string | null;
  is_read: boolean;
  created_at: string;
};

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type as Notification["type"],
    title: row.title,
    message: row.message,
    author_name: row.author_name,
    is_read: row.is_read,
    created_at: row.created_at,
  };
}

export async function sbListNotificationsForUser(
  userId: string,
  opts?: { limit?: number; since?: string },
): Promise<Notification[]> {
  const limit = Math.max(1, Math.min(100, opts?.limit ?? 50));
  let query = getSupabaseAdmin()
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts?.since) {
    query = query.gt("created_at", opts.since);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as NotificationRow[]).map(mapNotification);
}

export async function sbGetUnreadCount(userId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw error;
  return count ?? 0;
}

export async function sbInsertNotification(
  notification: Notification,
): Promise<Notification> {
  const { data, error } = await getSupabaseAdmin()
    .from("notifications")
    .insert({
      id: notification.id,
      user_id: notification.user_id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      author_name: notification.author_name,
      is_read: notification.is_read,
      created_at: notification.created_at,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapNotification(data as NotificationRow);
}

export async function sbUpdateNotification(
  notification: Notification,
): Promise<Notification> {
  const { data, error } = await getSupabaseAdmin()
    .from("notifications")
    .update({
      is_read: notification.is_read,
    })
    .eq("id", notification.id)
    .eq("user_id", notification.user_id)
    .select("*")
    .single();

  if (error) throw error;
  return mapNotification(data as NotificationRow);
}

export async function sbMarkAllNotificationsRead(
  userId: string,
): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false)
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}

export async function sbDeleteNotification(
  id: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function sbDeleteReadNotifications(userId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("notifications")
    .delete()
    .eq("user_id", userId)
    .eq("is_read", true)
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}
