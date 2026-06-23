"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getNotificationDisplayMessage,
  getNotificationHref,
  getNotificationSection,
  isOnNotificationSection,
  pathnameMatchesNotificationSection,
  shouldShowNotificationToast,
} from "@/lib/notifications/navigation";
import {
  isNotificationSoundEnabled,
  playNotificationSound,
  unlockNotificationAudio,
} from "@/lib/notifications/play-sound";
import {
  NotificationContext,
  type NotificationItem,
} from "./notification-context";
import { NOTIFICATION_TYPE_ICONS, isSuccessNotification } from "./constants";
import styles from "./NotificationToastStack.module.css";

const TOAST_AUTO_DISMISS_MS = 12_000;

type ToastItem = {
  id: string;
  notification: NotificationItem;
};

function NotificationToasts({
  toasts,
  onDismiss,
  onOpen,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onOpen: (notification: NotificationItem) => void;
}) {
  return (
    <div className={styles.stack} aria-live="polite">
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          notification={toast.notification}
          onDismiss={() => onDismiss(toast.id)}
          onOpen={() => onOpen(toast.notification)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  notification,
  onDismiss,
  onOpen,
}: {
  notification: NotificationItem;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const href = getNotificationHref(
    notification.type,
    notification.message,
  );
  const isSuccess = isSuccessNotification(notification.type);

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, TOAST_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <button
      type="button"
      className={[styles.toast, isSuccess ? styles.toastSuccess : ""]
        .filter(Boolean)
        .join(" ")}
      role="status"
      onClick={() => {
        onOpen();
        onDismiss();
      }}
    >
      <div className={styles.toastTitle}>
        {NOTIFICATION_TYPE_ICONS[notification.type]} {notification.title}
      </div>
      {notification.author_name ? (
        <div className={styles.toastAuthor}>{notification.author_name}:</div>
      ) : null}
      <div className={styles.toastMessage}>
        {getNotificationDisplayMessage(
          notification.type,
          notification.message,
        )}
      </div>
      {href ? <div className={styles.toastAction}>Открыть раздел →</div> : null}
      <span
        className={styles.toastClose}
        role="presentation"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
        aria-hidden
      >
        ×
      </span>
    </button>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const pollSinceRef = useRef<string | null>(null);
  const markReadRef = useRef<(id: string) => Promise<void>>(async () => {});

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (notification: NotificationItem) => {
      if (!shouldShowNotificationToast(notification.type)) return;
      if (isOnNotificationSection(pathname, notification.type)) return;

      let added = false;
      setToasts((prev) => {
        if (prev.some((item) => item.id === notification.id)) return prev;
        added = true;
        return [...prev, { id: notification.id, notification }];
      });

      if (added && isNotificationSoundEnabled()) {
        playNotificationSound();
      }
    },
    [pathname],
  );

  const openToast = useCallback(
    (notification: NotificationItem) => {
      const href = getNotificationHref(
        notification.type,
        notification.message,
      );
      if (href) {
        router.push(href);
      }
      if (!notification.is_read) {
        void markReadRef.current(notification.id);
      }
    },
    [router],
  );

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
      try {
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
      } catch {
        // Сеть недоступна — не ломаем UI.
      }
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

  markReadRef.current = markRead;

  const markAllRead = useCallback(async () => {
    const res = await fetch("/api/notifications/read-all", { method: "POST" });
    if (!res.ok) return;

    setNotifications((prev) =>
      prev.map((item) => ({ ...item, is_read: true })),
    );
    setUnread(0);
  }, []);

  const removeNotification = useCallback(async (id: string) => {
    const res = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const clearRead = useCallback(async () => {
    const res = await fetch("/api/notifications/read-all", {
      method: "DELETE",
    });
    if (!res.ok) return;
    setNotifications((prev) => prev.filter((item) => !item.is_read));
  }, []);

  useEffect(() => {
    const unlock = () => {
      void unlockNotificationAudio();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
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

  useEffect(() => {
    const idsToMark: string[] = [];

    setToasts((prev) =>
      prev.filter((toast) => {
        const section = getNotificationSection(toast.notification.type);
        if (
          section &&
          pathnameMatchesNotificationSection(pathname, section)
        ) {
          if (!toast.notification.is_read) {
            idsToMark.push(toast.id);
          }
          return false;
        }
        return true;
      }),
    );

    for (const id of idsToMark) {
      void markRead(id);
    }
  }, [pathname, markRead]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unread,
        loading,
        markRead,
        markAllRead,
        removeNotification,
        clearRead,
        refresh,
      }}
    >
      {children}
      <NotificationToasts
        toasts={toasts}
        onDismiss={dismissToast}
        onOpen={openToast}
      />
    </NotificationContext.Provider>
  );
}
