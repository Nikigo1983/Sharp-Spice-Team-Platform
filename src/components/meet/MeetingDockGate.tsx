"use client";

import {
  clearMeetingDockActive,
  closeMeetingDockWindow,
  focusMeetingDockWindow,
} from "@/lib/calendar/meeting-dock";
import styles from "./MeetingDockGate.module.css";

type MeetingDockGateProps = {
  eventId: string;
  eventTitle: string;
  onConnectHere: () => void;
};

export function MeetingDockGate({
  eventId,
  eventTitle,
  onConnectHere,
}: MeetingDockGateProps) {
  function handleOpenDock() {
    focusMeetingDockWindow(eventId);
  }

  function handleConnectHere() {
    closeMeetingDockWindow(eventId);
    clearMeetingDockActive();
    onConnectHere();
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Звонок уже открыт</h1>
      <p className={styles.text}>
        «{eventTitle}» идёт в отдельном окне. Откройте его или подключитесь здесь —
        тогда окно звонка закроется.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={handleOpenDock}>
          Открыть окно звонка
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={handleConnectHere}
        >
          Подключиться здесь
        </button>
      </div>
    </div>
  );
}
