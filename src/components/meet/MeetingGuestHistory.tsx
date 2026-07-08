"use client";

import { useCallback, useEffect, useState } from "react";
import type { CalendarMeetingGuestAdmission } from "@/lib/calendar/types";
import styles from "./MeetingGuestHistory.module.css";

const STATUS_LABELS: Record<CalendarMeetingGuestAdmission["status"], string> = {
  pending: "Ожидает",
  admitted: "Подключился",
  rejected: "Отклонён",
  left: "Вышел",
};

type MeetingGuestHistoryProps = {
  eventId: string;
};

export function MeetingGuestHistory({ eventId }: MeetingGuestHistoryProps) {
  const [admissions, setAdmissions] = useState<CalendarMeetingGuestAdmission[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/calendar/events/${encodeURIComponent(eventId)}/guest-admissions?all=true`,
      );
      const payload = (await response.json()) as {
        admissions?: CalendarMeetingGuestAdmission[];
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Не удалось загрузить гостей");
        setAdmissions([]);
        return;
      }

      setAdmissions(payload.admissions ?? []);
    } catch {
      setError("Не удалось загрузить гостей");
      setAdmissions([]);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (loading) {
    return <p className={styles.status}>Загрузка гостей…</p>;
  }

  if (error) {
    return <p className={styles.error}>{error}</p>;
  }

  if (admissions.length === 0) {
    return (
      <p className={styles.empty}>Пока никто не подключался по гостевой ссылке.</p>
    );
  }

  return (
    <section className={styles.section} aria-label="Гости по ссылке">
      <h3 className={styles.title}>Гости по ссылке</h3>
      <ul className={styles.list}>
        {admissions.map((admission) => (
          <li key={admission.id} className={styles.item}>
            <span className={styles.name}>{admission.displayName}</span>
            <span className={styles.meta}>
              {STATUS_LABELS[admission.status]}
              {admission.decidedAt
                ? ` · ${new Date(admission.decidedAt).toLocaleString("ru-RU")}`
                : ` · ${new Date(admission.createdAt).toLocaleString("ru-RU")}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
