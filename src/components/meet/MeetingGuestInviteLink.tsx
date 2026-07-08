"use client";

import { useCallback, useEffect, useState } from "react";
import type { CalendarEvent } from "@/lib/calendar/types";
import styles from "./MeetingGuestInviteLink.module.css";

type MeetingGuestInviteLinkProps = {
  event: CalendarEvent;
  canRegenerate: boolean;
};

export function MeetingGuestInviteLink({
  event,
  canRegenerate,
}: MeetingGuestInviteLinkProps) {
  const [guestJoinUrl, setGuestJoinUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const loadInvite = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/calendar/events/${encodeURIComponent(event.id)}/guest-invite`,
      );
      const payload = (await response.json()) as {
        guestJoinUrl?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Не удалось получить ссылку");
        setGuestJoinUrl(null);
        return;
      }

      setGuestJoinUrl(payload.guestJoinUrl ?? null);
    } catch {
      setError("Не удалось получить ссылку");
      setGuestJoinUrl(null);
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  useEffect(() => {
    void loadInvite();
  }, [loadInvite]);

  async function handleCopy() {
    if (!guestJoinUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(guestJoinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Скопируйте ссылку для клиента:", guestJoinUrl);
    }
  }

  async function handleRegenerate() {
    if (!canRegenerate || regenerating) {
      return;
    }

    const confirmed = window.confirm(
      "Создать новую ссылку? Старая перестанет работать.",
    );
    if (!confirmed) {
      return;
    }

    setRegenerating(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/calendar/events/${encodeURIComponent(event.id)}/guest-invite/regenerate`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        guestJoinUrl?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Не удалось обновить ссылку");
        return;
      }

      setGuestJoinUrl(payload.guestJoinUrl ?? null);
    } catch {
      setError("Не удалось обновить ссылку");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <section className={styles.section} aria-label="Ссылка для клиента">
      <div className={styles.header}>
        <h3 className={styles.title}>Ссылка для клиента</h3>
        <p className={styles.hint}>
          Отправьте эту ссылку человеку без аккаунта на платформе. Регистрация не
          нужна.
        </p>
      </div>

      {loading ? (
        <p className={styles.status}>Загрузка ссылки…</p>
      ) : error ? (
        <p className={styles.error}>{error}</p>
      ) : guestJoinUrl ? (
        <div className={styles.urlRow}>
          <input
            className={styles.urlInput}
            value={guestJoinUrl}
            readOnly
            aria-label="Гостевая ссылка"
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" className={styles.copyButton} onClick={() => void handleCopy()}>
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
      ) : null}

      {canRegenerate && !loading ? (
        <button
          type="button"
          className={styles.regenerateButton}
          onClick={() => void handleRegenerate()}
          disabled={regenerating}
        >
          {regenerating ? "Обновление…" : "Новая ссылка"}
        </button>
      ) : null}
    </section>
  );
}
