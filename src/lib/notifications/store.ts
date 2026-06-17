import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { listTeamUsers } from "@/lib/auth/users";
import { getDeletedUserIds } from "@/lib/team/store";
import type { CreateNotificationInput, Notification } from "./types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbNotifications from "@/lib/supabase/notifications-repo";

const STORE_PATH = path.join(process.cwd(), ".data", "notifications.json");

type NotificationStore = {
  notifications: Notification[];
};

async function readStore(): Promise<NotificationStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as NotificationStore;
    if (!Array.isArray(data.notifications)) return { notifications: [] };
    return data;
  } catch {
    return { notifications: [] };
  }
}

async function writeStore(store: NotificationStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  store.notifications.sort((a, b) => b.created_at.localeCompare(a.created_at));
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function listNotificationsForUser(
  userId: string,
  opts?: { limit?: number; since?: string },
): Promise<Notification[]> {
  if (isSupabaseConfigured()) {
    try {
      return await sbNotifications.sbListNotificationsForUser(userId, opts);
    } catch (error) {
      console.error("[notifications] supabase list", error);
      return [];
    }
  }

  const store = await readStore();
  const limit = Math.max(1, Math.min(100, opts?.limit ?? 50));

  let items = store.notifications.filter((item) => item.user_id === userId);

  if (opts?.since) {
    items = items.filter((item) => item.created_at > opts.since!);
  }

  return items
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function getUnreadCount(userId: string): Promise<number> {
  if (isSupabaseConfigured()) {
    try {
      return await sbNotifications.sbGetUnreadCount(userId);
    } catch (error) {
      console.error("[notifications] supabase unread", error);
      return 0;
    }
  }

  const store = await readStore();
  return store.notifications.filter(
    (item) => item.user_id === userId && !item.is_read,
  ).length;
}

export async function createNotificationForUser(
  userId: string,
  input: CreateNotificationInput,
): Promise<Notification> {
  const now = new Date().toISOString();
  const notification: Notification = {
    id: randomUUID(),
    user_id: userId,
    type: input.type,
    title: input.title,
    message: input.message,
    author_name: input.author_name ?? null,
    is_read: false,
    created_at: now,
  };

  if (isSupabaseConfigured()) {
    try {
      return await sbNotifications.sbInsertNotification(notification);
    } catch (error) {
      console.error("[notifications] supabase create", error);
      throw error;
    }
  }

  const store = await readStore();
  store.notifications.unshift(notification);
  await writeStore(store);
  return notification;
}

export async function createNotificationsForTeam(
  input: CreateNotificationInput,
  opts?: { excludeUserId?: string; onlyUserIds?: string[] },
): Promise<Notification[]> {
  const deleted = new Set(await getDeletedUserIds());
  const users = listTeamUsers().filter((user) => {
    if (deleted.has(user.id)) return false;
    if (opts?.excludeUserId && user.id === opts.excludeUserId) return false;
    if (opts?.onlyUserIds && !opts.onlyUserIds.includes(user.id)) return false;
    return true;
  });

  const created: Notification[] = [];
  for (const user of users) {
    created.push(await createNotificationForUser(user.id, input));
  }
  return created;
}

export async function markNotificationRead(
  id: string,
  userId: string,
): Promise<Notification | null> {
  if (isSupabaseConfigured()) {
    try {
      const items = await sbNotifications.sbListNotificationsForUser(userId, {
        limit: 100,
      });
      const current = items.find((item) => item.id === id);
      if (!current || current.is_read) return current ?? null;
      return await sbNotifications.sbUpdateNotification({
        ...current,
        is_read: true,
      });
    } catch (error) {
      console.error("[notifications] supabase read", error);
      return null;
    }
  }

  const store = await readStore();
  const index = store.notifications.findIndex(
    (item) => item.id === id && item.user_id === userId,
  );
  if (index < 0) return null;

  const updated: Notification = {
    ...store.notifications[index],
    is_read: true,
  };
  store.notifications[index] = updated;
  await writeStore(store);
  return updated;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  if (isSupabaseConfigured()) {
    try {
      return await sbNotifications.sbMarkAllNotificationsRead(userId);
    } catch (error) {
      console.error("[notifications] supabase read all", error);
      return 0;
    }
  }

  const store = await readStore();
  let count = 0;

  store.notifications = store.notifications.map((item) => {
    if (item.user_id !== userId || item.is_read) return item;
    count += 1;
    return { ...item, is_read: true };
  });

  if (count > 0) {
    await writeStore(store);
  }

  return count;
}

export async function deleteNotification(
  id: string,
  userId: string,
): Promise<boolean> {
  if (isSupabaseConfigured()) {
    try {
      return await sbNotifications.sbDeleteNotification(id, userId);
    } catch (error) {
      console.error("[notifications] supabase delete one", error);
      return false;
    }
  }

  const store = await readStore();
  const before = store.notifications.length;
  store.notifications = store.notifications.filter(
    (item) => !(item.id === id && item.user_id === userId),
  );
  if (store.notifications.length === before) return false;
  await writeStore(store);
  return true;
}

export async function deleteReadNotifications(userId: string): Promise<number> {
  if (isSupabaseConfigured()) {
    try {
      return await sbNotifications.sbDeleteReadNotifications(userId);
    } catch (error) {
      console.error("[notifications] supabase clear read", error);
      return 0;
    }
  }

  const store = await readStore();
  const before = store.notifications.length;
  store.notifications = store.notifications.filter(
    (item) => !(item.user_id === userId && item.is_read),
  );
  const removed = before - store.notifications.length;
  if (removed > 0) {
    await writeStore(store);
  }
  return removed;
}
