"use client";

import { useEffect, useState } from "react";
import styles from "./PwaInstallHint.module.css";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallHint() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        (window.navigator as Navigator & { standalone?: boolean }).standalone);

    if (standalone) {
      setInstalled(true);
      return;
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed || !deferredPrompt) {
    return null;
  }

  return (
    <div className={styles.banner} role="status">
      <p className={styles.text}>
        Установите Sharp & Spice как приложение на ноутбук — быстрый доступ с
        рабочего стола.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.installBtn}
          onClick={() => {
            void deferredPrompt.prompt();
            void deferredPrompt.userChoice.finally(() => {
              setDeferredPrompt(null);
            });
          }}
        >
          Установить
        </button>
        <button
          type="button"
          className={styles.dismissBtn}
          onClick={() => setDismissed(true)}
        >
          Не сейчас
        </button>
      </div>
    </div>
  );
}
