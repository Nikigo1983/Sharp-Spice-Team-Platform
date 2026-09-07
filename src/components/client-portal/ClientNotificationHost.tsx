"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setAppUnreadBadge } from "@/lib/notifications/app-badge";
import {
  ensureBrowserNotificationPermission,
  isAppInBackground,
  showSystemNotification,
} from "@/lib/notifications/system-notify";
import {
  isNotificationSoundEnabled,
  playNotificationSound,
  unlockNotificationAudio,
} from "@/lib/notifications/play-sound";

type ClientNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

/**
 * Keeps PWA icon badge + OS alerts in sync for the client portal.
 * Polls /api/client/notifications (status updates).
 */
export function ClientNotificationHost() {
  const [unread, setUnread] = useState(0);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const pollSinceRef = useRef<string | null>(null);

  const fetchNotifications = useCallback(async (opts?: { since?: string }) => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (opts?.since) params.set("since", opts.since);
      const res = await fetch(`/api/client/notifications?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: ClientNotification[];
        unread: number;
      };

      setUnread(data.unread);
      void setAppUnreadBadge(data.unread);

      if (!initializedRef.current) {
        for (const item of data.notifications) {
          knownIdsRef.current.add(item.id);
        }
        pollSinceRef.current =
          data.notifications[0]?.created_at ?? new Date().toISOString();
        initializedRef.current = true;
        return;
      }

      for (const item of data.notifications) {
        if (knownIdsRef.current.has(item.id)) continue;
        knownIdsRef.current.add(item.id);
        if (item.is_read) continue;

        if (isAppInBackground()) {
          const permission = await ensureBrowserNotificationPermission();
          let shown = false;
          if (permission === "granted") {
            shown = await showSystemNotification({
              id: item.id,
              title: item.title,
              body: item.message,
              href: "/client",
              tag: `ss-client-${item.id}`,
              autoCloseMs: 8_000,
            });
          }
          if (!shown && isNotificationSoundEnabled()) {
            playNotificationSound({ allowHidden: true });
          }
        } else if (isNotificationSoundEnabled()) {
          playNotificationSound();
        }
      }

      if (data.notifications.length > 0) {
        pollSinceRef.current = data.notifications.reduce(
          (acc, item) => (item.created_at > acc ? item.created_at : acc),
          data.notifications[0]!.created_at,
        );
      }
    } catch {
      // ignore network errors
    }
  }, []);

  useEffect(() => {
    const unlock = () => {
      void unlockNotificationAudio();
      void ensureBrowserNotificationPermission();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    const poll = () => {
      if (!pollSinceRef.current) return;
      void fetchNotifications({ since: pollSinceRef.current });
    };
    const schedule = () => {
      if (timer != null) window.clearInterval(timer);
      const ms =
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
          ? 2500
          : 4000;
      timer = window.setInterval(poll, ms);
    };

    void fetchNotifications();
    schedule();

    const onWake = () => {
      void setAppUnreadBadge(unread);
      schedule();
      poll();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("blur", poll);

    return () => {
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("blur", poll);
    };
  }, [fetchNotifications, unread]);

  useEffect(() => {
    void setAppUnreadBadge(unread);
  }, [unread]);

  return null;
}
