"use client";

import { createContext, useContext } from "react";
import type { NotificationType } from "@/lib/notifications/types";

export type NotificationItem = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  author_name: string | null;
  is_read: boolean;
  created_at: string;
};

export type NotificationContextValue = {
  notifications: NotificationItem[];
  unread: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  removeNotification: (id: string) => Promise<void>;
  clearRead: () => Promise<void>;
  refresh: () => Promise<void>;
};

export const NotificationContext =
  createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}

export function useNotificationsOptional() {
  return useContext(NotificationContext);
}
