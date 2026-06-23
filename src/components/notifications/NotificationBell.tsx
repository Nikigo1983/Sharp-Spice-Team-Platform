"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  NOTIFICATION_TYPE_ICONS,
  NOTIFICATION_TYPE_LABELS,
  formatNotificationTime,
  isSuccessNotification,
} from "./constants";
import { getNotificationDisplayMessage, getNotificationActionLabel, getNotificationHref } from "@/lib/notifications/navigation";
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  unlockNotificationAudio,
} from "@/lib/notifications/play-sound";
import { useNotificationsOptional } from "./notification-context";
import styles from "./NotificationBell.module.css";

export function NotificationBell() {
  const router = useRouter();
  const ctx = useNotificationsOptional();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    setSoundEnabled(isNotificationSoundEnabled());
  }, []);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", onDocClick);
    }

    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const unread = ctx?.unread ?? 0;
  const notifications = ctx?.notifications ?? [];
  const unreadNotifications = notifications.filter((item) => !item.is_read);
  const hasRead = notifications.length > unreadNotifications.length;
  const loading = ctx?.loading ?? false;

  async function handleOpenItem(
    id: string,
    isRead: boolean,
    type: (typeof notifications)[number]["type"],
    message: string,
  ) {
    if (!ctx) return;
    if (!isRead) {
      await ctx.markRead(id);
    }
    const href = getNotificationHref(type, message);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellButton}
        onClick={() => {
          if (!ctx) return;
          void unlockNotificationAudio();
          setOpen((value) => !value);
        }}
        aria-label="Уведомления"
        aria-expanded={open}
        disabled={!mounted || !ctx}
      >
        <i className="fa-solid fa-bell" aria-hidden />
        {unread > 0 ? (
          <span className={styles.badge}>{unread > 99 ? "99+" : unread}</span>
        ) : null}
      </button>

      {open && ctx ? (
        <div
          className={styles.panel}
          role="dialog"
          aria-label="Центр уведомлений"
        >
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Уведомления</h3>
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.soundToggle}
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  setNotificationSoundEnabled(next);
                  if (next) void unlockNotificationAudio();
                }}
                title={
                  soundEnabled
                    ? "Отключить звук уведомлений"
                    : "Включить звук уведомлений"
                }
              >
                {soundEnabled ? "🔔 Звук вкл." : "🔕 Звук выкл."}
              </button>
              {unread > 0 ? (
                <button
                  type="button"
                  className={styles.markAll}
                  onClick={() => void ctx.markAllRead()}
                >
                  Прочитать все
                </button>
              ) : null}
              {hasRead ? (
                <button
                  type="button"
                  className={styles.clearRead}
                  onClick={() => void ctx.clearRead()}
                >
                  Очистить просмотренные
                </button>
              ) : null}
            </div>
          </header>

          <div className={styles.list}>
            {loading && unreadNotifications.length === 0 ? (
              <p className={styles.empty}>Загрузка…</p>
            ) : unreadNotifications.length === 0 ? (
              <p className={styles.empty}>Новых уведомлений нет.</p>
            ) : (
              unreadNotifications.map((item) => {
                const isSuccess = isSuccessNotification(item.type);
                const actionLabel = getNotificationActionLabel(
                  item.type,
                  item.message,
                );
                return (
                <div
                  key={item.id}
                  className={[
                    styles.item,
                    item.is_read ? styles.itemRead : styles.itemUnread,
                    isSuccess ? styles.itemSuccess : "",
                    isSuccess && !item.is_read ? styles.itemSuccessUnread : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={styles.itemTop}>
                    <button
                      type="button"
                      className={styles.itemTypeBtn}
                      onClick={() =>
                        void handleOpenItem(
                          item.id,
                          item.is_read,
                          item.type,
                          item.message,
                        )
                      }
                    >
                      <span
                        className={[
                          styles.itemType,
                          isSuccess ? styles.itemTypeSuccess : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {NOTIFICATION_TYPE_ICONS[item.type]}{" "}
                        {NOTIFICATION_TYPE_LABELS[item.type]}
                      </span>
                    </button>
                    <span className={styles.itemTime}>
                      {formatNotificationTime(item.created_at)}
                    </span>
                    <button
                      type="button"
                      className={styles.closeBtn}
                      aria-label="Закрыть уведомление"
                      onClick={() => void ctx.removeNotification(item.id)}
                    >
                      ×
                    </button>
                  </div>
                  <p className={styles.itemTitle}>{item.title}</p>
                  {item.author_name ? (
                    <p className={styles.itemAuthor}>{item.author_name}</p>
                  ) : null}
                  <p
                    className={[
                      styles.itemMessage,
                      isSuccess ? styles.itemMessageSuccess : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {getNotificationDisplayMessage(item.type, item.message)}
                  </p>
                  {actionLabel ? (
                    <button
                      type="button"
                      className={styles.joinButton}
                      onClick={() =>
                        void handleOpenItem(
                          item.id,
                          item.is_read,
                          item.type,
                          item.message,
                        )
                      }
                    >
                      {actionLabel}
                    </button>
                  ) : null}
                </div>
              );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
