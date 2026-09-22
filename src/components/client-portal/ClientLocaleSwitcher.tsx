"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ClientPortalLocale } from "@/lib/client-portal/types";
import { t } from "@/lib/client-portal/portal-i18n";
import styles from "./ClientLocaleSwitcher.module.css";

export function ClientLocaleSwitcher({
  locale,
  variant = "portal",
  onChanged,
}: {
  locale: ClientPortalLocale;
  variant?: "portal" | "auth";
  onChanged?: (locale: ClientPortalLocale) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(locale);

  useEffect(() => {
    setCurrent(locale);
  }, [locale]);

  function setLocale(next: ClientPortalLocale) {
    if (next === current || pending) return;
    startTransition(async () => {
      const res = await fetch("/api/client/locale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (!res.ok) return;
      setCurrent(next);
      onChanged?.(next);
      router.refresh();
    });
  }

  return (
    <div
      className={variant === "auth" ? styles.authWrap : styles.wrap}
      role="group"
      aria-label={t("language", current)}
    >
      <button
        type="button"
        className={`${styles.btn}${current === "ru" ? ` ${styles.active}` : ""}`}
        disabled={pending}
        aria-pressed={current === "ru"}
        onClick={() => setLocale("ru")}
      >
        RU
      </button>
      <button
        type="button"
        className={`${styles.btn}${current === "en" ? ` ${styles.active}` : ""}`}
        disabled={pending}
        aria-pressed={current === "en"}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
    </div>
  );
}
