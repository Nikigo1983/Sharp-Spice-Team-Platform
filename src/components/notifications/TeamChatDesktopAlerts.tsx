"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { TeamChatMessage } from "@/lib/team-chat/types";
import { setTeamChatUnreadForBadge } from "@/lib/notifications/app-badge";
import {
  getBrowserNotificationPermission,
  isAppInBackground,
  requestBrowserNotificationPermission,
  showSystemNotification,
} from "@/lib/notifications/system-notify";
import {
  isNotificationSoundEnabled,
  playNotificationSound,
  unlockNotificationAudio,
} from "@/lib/notifications/play-sound";
import styles from "./TeamChatDesktopAlerts.module.css";

const DISMISS_PERMISSION_KEY = "ss.desktop-permission-banner-dismissed.v1";

function previewForMessage(message: TeamChatMessage, fallback: string): string {
  if (message.message_type === "voice") return fallback;
  if (message.message_type === "image") return "📷";
  if (message.message_type === "file") {
    return message.file_name?.trim() || "📎";
  }
  const text = message.message_text?.trim() || "";
  return text.length > 160 ? `${text.slice(0, 160)}…` : text || fallback;
}

/**
 * Telegram-style desktop alerts driven by team-chat unread count.
 * Works even when the notifications table poll is delayed or permission
 * was never granted for the in-app toast path.
 */
export function TeamChatDesktopAlerts() {
  const pathname = usePathname();
  const prevUnreadRef = useRef<number | null>(null);
  const lastAlertedMessageIdRef = useRef<string | null>(null);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [showBanner, setShowBanner] = useState(false);

  const onTeamChat =
    pathname === "/team-chat" || pathname.startsWith("/team-chat/");

  useEffect(() => {
    setPermission(getBrowserNotificationPermission());
    try {
      const dismissed =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(DISMISS_PERMISSION_KEY) === "1";
      const current = getBrowserNotificationPermission();
      setShowBanner(!dismissed && current !== "granted" && current !== "unsupported");
    } catch {
      setShowBanner(true);
    }
  }, []);

  useEffect(() => {
    if (onTeamChat) {
      prevUnreadRef.current = 0;
      void setTeamChatUnreadForBadge(0);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    async function alertForLatestMessage() {
      try {
        const res = await fetch("/api/team-chat?limit=5");
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: TeamChatMessage[] };
        const list = data.messages ?? [];
        const latest = list.length > 0 ? list[list.length - 1] : undefined;
        if (!latest || cancelled) return;
        if (lastAlertedMessageIdRef.current === latest.id) return;
        lastAlertedMessageIdRef.current = latest.id;

        const body = previewForMessage(latest, "Новое сообщение");
        const perm = getBrowserNotificationPermission();
        setPermission(perm);

        let shown = false;
        if (perm === "granted") {
          shown = await showSystemNotification({
            id: `chat-${latest.id}`,
            title: latest.user_name?.trim() || "Командный чат",
            body,
            href: "/team-chat",
            tag: `ss-team-chat-${latest.id}`,
            autoCloseMs: 0,
          });
        }

        if (!shown && isNotificationSoundEnabled()) {
          playNotificationSound({
            allowHidden: isAppInBackground() || document.visibilityState === "hidden",
          });
        }
      } catch {
        // ignore
      }
    }

    async function tick() {
      try {
        const res = await fetch("/api/team-chat/unread");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { unread?: number };
        const unread = Math.max(0, data.unread ?? 0);
        const prev = prevUnreadRef.current;
        prevUnreadRef.current = unread;
        void setTeamChatUnreadForBadge(unread);

        if (prev === null) return;
        if (unread > prev) {
          await alertForLatestMessage();
        }
      } catch {
        // ignore
      }
    }

    const schedule = () => {
      if (timer != null) window.clearInterval(timer);
      const hidden =
        typeof document !== "undefined" &&
        (document.visibilityState === "hidden" || isAppInBackground());
      timer = window.setInterval(() => {
        void tick();
      }, hidden ? 2000 : 3000);
    };

    void tick();
    schedule();

    const onVis = () => {
      schedule();
      void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("blur", onVis);

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.removeEventListener("blur", onVis);
    };
  }, [onTeamChat]);

  if (!showBanner || permission === "granted" || permission === "unsupported") {
    return null;
  }

  return (
    <div className={styles.banner} role="status">
      <p className={styles.text}>
        {permission === "denied"
          ? "Уведомления заблокированы. В настройках Chrome/Edge для сайта Sharp & Spice включите «Уведомления»."
          : "Чтобы сообщения чата всплывали на рабочем столе со звуком (как в Telegram), разрешите уведомления Sharp & Spice."}
      </p>
      <div className={styles.actions}>
        {permission !== "denied" ? (
          <button
            type="button"
            className={styles.enable}
            onClick={() => {
              void (async () => {
                void unlockNotificationAudio();
                const next = await requestBrowserNotificationPermission();
                setPermission(next);
                if (next === "granted") setShowBanner(false);
              })();
            }}
          >
            Разрешить
          </button>
        ) : null}
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_PERMISSION_KEY, "1");
            } catch {
              // ignore
            }
            setShowBanner(false);
          }}
        >
          Позже
        </button>
      </div>
    </div>
  );
}
