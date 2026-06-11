"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  NOTIFICATION_TYPE_ICONS,
  NOTIFICATION_TYPE_LABELS,
  formatNotificationTime,
  isSuccessNotification,
} from "./constants";
import { getNotificationHref } from "@/lib/notifications/navigation";
import { useNotificationsOptional } from "./notification-context";
import styles from "./NotificationBell.module.css";

export function NotificationBell() {
  const router = useRouter();
  const ctx = useNotificationsOptional();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
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
  const loading = ctx?.loading ?? false;

  async function handleOpenItem(
    id: string,
    isRead: boolean,
    type: (typeof notifications)[number]["type"],
  ) {
    if (!ctx) return;
    if (!isRead) {
      await ctx.markRead(id);
    }
    const href = getNotificationHref(type);
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
            {unread > 0 ? (
              <button
                type="button"
                className={styles.markAll}
                onClick={() => void ctx.markAllRead()}
              >
                Прочитать все
              </button>
            ) : null}
          </header>

          <div className={styles.list}>
            {loading && notifications.length === 0 ? (
              <p className={styles.empty}>Загрузка…</p>
            ) : notifications.length === 0 ? (
              <p className={styles.empty}>Пока нет уведомлений.</p>
            ) : (
              notifications.map((item) => {
                const isSuccess = isSuccessNotification(item.type);
                return (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    styles.item,
                    item.is_read ? styles.itemRead : styles.itemUnread,
                    isSuccess ? styles.itemSuccess : "",
                    isSuccess && !item.is_read ? styles.itemSuccessUnread : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() =>
                    void handleOpenItem(item.id, item.is_read, item.type)
                  }
                >
                  <div className={styles.itemTop}>
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
                    <span className={styles.itemTime}>
                      {formatNotificationTime(item.created_at)}
                    </span>
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
                    {item.message}
                  </p>
                </button>
              );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
