"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CalendarMeetingRecordingWithEvent } from "@/lib/calendar/types";
import styles from "./MeetingRecordingsView.module.css";

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) {
    return "—";
  }

  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} МБ`;
}

export function MeetingRecordingsView() {
  const [recordings, setRecordings] = useState<
    CalendarMeetingRecordingWithEvent[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(
    null,
  );

  const loadRecordings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/meeting-recordings");
      const payload = (await response.json()) as {
        recordings?: CalendarMeetingRecordingWithEvent[];
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Не удалось загрузить записи");
        setRecordings([]);
        return;
      }

      setRecordings(payload.recordings ?? []);
    } catch {
      setError("Не удалось загрузить записи");
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecordings();
  }, [loadRecordings]);

  async function handlePlay(recordingId: string) {
    setActiveRecordingId(recordingId);
    setPlaybackUrl(null);

    try {
      const response = await fetch(
        `/api/meeting-recordings/${encodeURIComponent(recordingId)}/playback`,
      );
      const payload = (await response.json()) as {
        playbackUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.playbackUrl) {
        setError(payload.error ?? "Не удалось открыть запись");
        return;
      }

      setPlaybackUrl(payload.playbackUrl);
      setError(null);
    } catch {
      setError("Не удалось открыть запись");
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Записи встреч</h1>
          <p className={styles.subtitle}>
            Видеозаписи видеовстреч команды. Гости не могут записывать и не видят
            этот раздел.
          </p>
        </div>
      </header>

      {loading ? (
        <p className={styles.status}>Загрузка…</p>
      ) : error && recordings.length === 0 ? (
        <p className={styles.error}>{error}</p>
      ) : recordings.length === 0 ? (
        <p className={styles.empty}>
          Пока нет сохранённых записей. Во время видеовстречи нажмите «Запись» в
          панели управления.
        </p>
      ) : (
        <div className={styles.layout}>
          <ul className={styles.list}>
            {recordings.map((recording) => (
              <li key={recording.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <h2 className={styles.itemTitle}>{recording.eventTitle}</h2>
                  <p className={styles.itemMeta}>
                    {new Date(recording.eventStartAt).toLocaleString("ru-RU")}
                    {" · "}
                    {recording.startedByName}
                    {" · "}
                    {formatDuration(recording.durationSeconds)}
                    {" · "}
                    {formatFileSize(recording.fileSizeBytes)}
                  </p>
                  {recording.linkedClientName ? (
                    <p className={styles.clientMeta}>
                      Клиент: {recording.linkedClientName}
                    </p>
                  ) : null}
                </div>
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    className={styles.playButton}
                    onClick={() => void handlePlay(recording.id)}
                  >
                    Смотреть
                  </button>
                  <Link
                    href={`/calendar?event=${encodeURIComponent(recording.eventId)}`}
                    className={styles.eventLink}
                  >
                    Событие
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          <aside className={styles.playerPane}>
            {playbackUrl && activeRecordingId ? (
              <video
                className={styles.player}
                src={playbackUrl}
                controls
                playsInline
              />
            ) : (
              <div className={styles.playerPlaceholder}>
                Выберите запись и нажмите «Смотреть»
              </div>
            )}
            {error && recordings.length > 0 ? (
              <p className={styles.inlineError}>{error}</p>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
