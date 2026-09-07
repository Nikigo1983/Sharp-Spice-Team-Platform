"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  NOTIFICATION_TYPE_ICONS,
  NOTIFICATION_TYPE_LABELS,
  formatNotificationTime,
  isSuccessNotification,
} from "./constants";
import {
  getNotificationDisplayMessage,
  getNotificationActionLabel,
  getNotificationHref,
} from "@/lib/notifications/navigation";
import {
  isNotificationSoundEnabled,
  playNotificationSound,
  setNotificationSoundEnabled,
  unlockNotificationAudio,
} from "@/lib/notifications/play-sound";
import { subscribeToWebPush } from "@/lib/notifications/web-push-client";
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  showSystemNotification,
} from "@/lib/notifications/system-notify";
import { useNotificationsOptional } from "./notification-context";
import styles from "./NotificationBell.module.css";

export function NotificationBell() {
  const router = useRouter();
  const ctx = useNotificationsOptional();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopPermission, setDesktopPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    setSoundEnabled(isNotificationSoundEnabled());
    setDesktopPermission(getBrowserNotificationPermission());
  }, []);

  useEffect(() => {
    if (!open) return;
    setDesktopPermission(getBrowserNotificationPermission());
  }, [open]);

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

          {mounted ? (
            <div className={styles.desktopCallout}>
              {desktopPermission !== "granted" &&
              desktopPermission !== "unsupported" ? (
                <>
                  <p className={styles.desktopCalloutText}>
                    {desktopPermission === "denied"
                      ? "Уведомления заблокированы. В настройках Chrome/Edge для сайта Sharp & Spice включите «Уведомления»."
                      : "Чтобы сообщения чата всплывали на рабочем столе со звуком (как в Telegram), разрешите уведомления Sharp & Spice."}
                  </p>
                  {desktopPermission !== "denied" ? (
                    <div className={styles.desktopCalloutActions}>
                      <button
                        type="button"
                        className={styles.desktopCalloutBtn}
                        onClick={() => {
                          void (async () => {
                            void unlockNotificationAudio();
                            const next =
                              await requestBrowserNotificationPermission();
                            setDesktopPermission(next);
                            if (next === "granted") {
                              void subscribeToWebPush();
                            }
                          })();
                        }}
                      >
                        Разрешить
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}

              <button
                type="button"
                className={styles.helpToggle}
                aria-expanded={helpOpen}
                onClick={() => setHelpOpen((value) => !value)}
              >
                Что делать, если всплывающие уведомления не работают при
                неактивном приложении?
                <span className={styles.helpChevron} aria-hidden>
                  {helpOpen ? "▴" : "▾"}
                </span>
              </button>

              {helpOpen ? (
                <div className={styles.helpBody}>
                  <p className={styles.desktopCalloutHint}>
                    Если всплывающее уведомление не появляется: Параметры
                    Windows → Система → Уведомления — включите для Google Chrome
                    (или Edge) и Sharp & Spice. В этом же разделе выключите «Не
                    беспокоить» (или нажмите Win+A и отключите «Не беспокоить» в
                    быстрых настройках). После проверки нажмите Win+N — сообщение
                    может быть в центре уведомлений.
                  </p>
                  <div className={styles.desktopCalloutActions}>
                    {desktopPermission === "granted" ? (
                      <button
                        type="button"
                        className={styles.desktopCalloutBtn}
                        disabled={testBusy}
                        onClick={() => {
                          void (async () => {
                            setTestBusy(true);
                            setTestResult(null);
                            try {
                              void unlockNotificationAudio();
                              playNotificationSound({ allowHidden: true });
                              const shown = await showSystemNotification({
                                id: `test-${Date.now()}`,
                                title: "Sharp & Spice",
                                body: "Если вы это видите — всплывающие уведомления Sharp & Spice работают.",
                                href: "/",
                                tag: `ss-test-${Date.now()}`,
                                autoCloseMs: 12_000,
                                requireInteraction: true,
                                force: true,
                              });
                              setTestResult(
                                shown
                                  ? "Отправлено. Если всплывающего уведомления нет — откройте центр уведомлений (Win+N) и проверьте настройки Windows выше."
                                  : "Не удалось показать уведомление. Проверьте разрешение сайта и настройки Windows.",
                              );
                            } finally {
                              setTestBusy(false);
                            }
                          })();
                        }}
                      >
                        Проверить уведомление
                      </button>
                    ) : null}
                  </div>
                  {testResult ? (
                    <p className={styles.desktopCalloutResult}>{testResult}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

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
