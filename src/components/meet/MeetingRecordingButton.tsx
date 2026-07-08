"use client";

import { useCallback, useEffect, useState } from "react";
import type { CalendarMeetingRecording } from "@/lib/calendar/types";
import styles from "./MeetingRecordingButton.module.css";

type MeetingRecordingButtonProps = {
  eventId: string;
};

export function MeetingRecordingButton({ eventId }: MeetingRecordingButtonProps) {
  const [recording, setRecording] = useState<CalendarMeetingRecording | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/calendar/events/${encodeURIComponent(eventId)}/meeting-recording`,
      );
      const payload = (await response.json()) as {
        recording?: CalendarMeetingRecording | null;
        error?: string;
      };

      if (response.ok) {
        setRecording(payload.recording ?? null);
        setError(null);
      }
    } catch {
      // ignore polling errors
    }
  }, [eventId]);

  useEffect(() => {
    void loadStatus();
    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [loadStatus]);

  const isRecording =
    recording?.status === "active" ||
    recording?.status === "starting" ||
    recording?.status === "processing";

  async function handleToggle() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/calendar/events/${encodeURIComponent(eventId)}/meeting-recording`,
        { method: isRecording ? "DELETE" : "POST" },
      );
      const payload = (await response.json()) as {
        recording?: CalendarMeetingRecording;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Не удалось управлять записью");
        return;
      }

      setRecording(payload.recording ?? null);
    } catch {
      setError("Не удалось управлять записью");
    } finally {
      setLoading(false);
      void loadStatus();
    }
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.button} ${isRecording ? styles.buttonActive : ""}`}
        onClick={() => void handleToggle()}
        disabled={loading}
        aria-label={isRecording ? "Остановить запись" : "Начать запись"}
        title={
          isRecording
            ? "Остановить запись встречи"
            : "Записать встречу (только для команды)"
        }
      >
        <i
          className={`fa-solid ${isRecording ? "fa-stop" : "fa-circle"}`}
          aria-hidden="true"
        />
        {loading
          ? "…"
          : isRecording
            ? "Стоп"
            : "Запись"}
      </button>
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}
