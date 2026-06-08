"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  NotificationContext,
  type NotificationItem,
} from "./notification-context";
import { NOTIFICATION_TYPE_ICONS } from "./constants";
import styles from "./NotificationToastStack.module.css";

type ToastItem = {
  id: string;
  notification: NotificationItem;
};

function NotificationToasts({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className={styles.stack} aria-live="polite">
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          notification={toast.notification}
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  notification,
  onDismiss,
}: {
  notification: NotificationItem;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={styles.toast} role="status">
      <div className={styles.toastTitle}>
        {NOTIFICATION_TYPE_ICONS[notification.type]} {notification.title}
      </div>
      {notification.author_name ? (
        <div className={styles.toastAuthor}>{notification.author_name}:</div>
      ) : null}
      <div className={styles.toastMessage}>{notification.message}</div>
    </div>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const pollSinceRef = useRef<string | null>(null);

  const isOnTeamChat =
    pathname === "/team-chat" || pathname.startsWith("/team-chat/");

  const showToast = useCallback(
    (notification: NotificationItem) => {
      if (notification.type === "team_chat" && isOnTeamChat) {
        return;
      }

      setToasts((prev) => {
        if (prev.some((item) => item.id === notification.id)) return prev;
        return [...prev, { id: notification.id, notification }];
      });
    },
    [isOnTeamChat],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const applyNotifications = useCallback(
    (items: NotificationItem[], unreadCount: number, isPoll = false) => {
      setNotifications((prev) => {
        const map = new Map(prev.map((item) => [item.id, item]));
        for (const item of items) {
          map.set(item.id, item);
        }
        return Array.from(map.values()).sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        );
      });
      setUnread(unreadCount);

      if (!initializedRef.current) {
        for (const item of items) {
          knownIdsRef.current.add(item.id);
        }
        pollSinceRef.current =
          items.length > 0
            ? items[0].created_at
            : new Date().toISOString();
        initializedRef.current = true;
        return;
      }

      if (!isPoll) return;

      for (const item of items) {
        if (knownIdsRef.current.has(item.id)) continue;
        knownIdsRef.current.add(item.id);
        if (!item.is_read) {
          showToast(item);
        }
      }

      if (items.length > 0) {
        const latest = items.reduce(
          (acc, item) => (item.created_at > acc ? item.created_at : acc),
          items[0].created_at,
        );
        pollSinceRef.current = latest;
      }
    },
    [showToast],
  );

  const fetchNotifications = useCallback(
    async (opts?: { since?: string; initial?: boolean }) => {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (opts?.since) {
        params.set("since", opts.since);
      }

      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: NotificationItem[];
        unread: number;
      };

      applyNotifications(data.notifications, data.unread, !opts?.initial);
    },
    [applyNotifications],
  );

  const refresh = useCallback(async () => {
    await fetchNotifications({ initial: true });
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    const res = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
    });
    if (!res.ok) return;

    const data = (await res.json()) as { notification: NotificationItem };
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? data.notification : item)),
    );
    setUnread((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    const res = await fetch("/api/notifications/read-all", { method: "POST" });
    if (!res.ok) return;

    setNotifications((prev) =>
      prev.map((item) => ({ ...item, is_read: true })),
    );
    setUnread(0);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      await fetchNotifications({ initial: true });
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchNotifications]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!pollSinceRef.current) return;
      void fetchNotifications({ since: pollSinceRef.current });
    }, 5000);

    return () => clearInterval(timer);
  }, [fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unread,
        loading,
        markRead,
        markAllRead,
        refresh,
      }}
    >
      {children}
      <NotificationToasts toasts={toasts} onDismiss={dismissToast} />
    </NotificationContext.Provider>
  );
}
