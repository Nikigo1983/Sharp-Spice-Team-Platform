"use client";

import { useCallback, useEffect, useState } from "react";
import type { CalendarMeetingGuestAdmission } from "@/lib/calendar/types";
import styles from "./MeetingGuestWaitingBanner.module.css";

export function usePendingGuestAdmissions(eventId: string) {
  const [pendingAdmissions, setPendingAdmissions] = useState<
    CalendarMeetingGuestAdmission[]
  >([]);

  const loadPending = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/calendar/events/${encodeURIComponent(eventId)}/guest-admissions`,
      );
      const payload = (await response.json()) as {
        admissions?: CalendarMeetingGuestAdmission[];
      };
      if (response.ok) {
        setPendingAdmissions(payload.admissions ?? []);
      }
    } catch {
      // ignore polling errors
    }
  }, [eventId]);

  useEffect(() => {
    void loadPending();
    const intervalId = window.setInterval(() => {
      void loadPending();
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [loadPending]);

  return pendingAdmissions;
}

type MeetingGuestWaitingBannerProps = {
  count: number;
  onOpenParticipants: () => void;
};

export function MeetingGuestWaitingBanner({
  count,
  onOpenParticipants,
}: MeetingGuestWaitingBannerProps) {
  if (count <= 0) {
    return null;
  }

  return (
    <div className={styles.banner}>
      <span>
        {count === 1
          ? "1 гость ждёт подключения"
          : `${count} гостя ждут подключения`}
      </span>
      <button type="button" className={styles.button} onClick={onOpenParticipants}>
        Открыть зал ожидания
      </button>
    </div>
  );
}
