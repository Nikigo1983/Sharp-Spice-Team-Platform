"use client";

import { useEffect, useState } from "react";
import {
  focusMeetingDockWindow,
  readMeetingDockSession,
  type MeetingDockSession,
} from "@/lib/calendar/meeting-dock";
import styles from "./MeetingDockBanner.module.css";

export function MeetingDockBanner() {
  const [session, setSession] = useState<MeetingDockSession | null>(null);

  useEffect(() => {
    function refresh() {
      setSession(readMeetingDockSession());
    }

    refresh();
    const timer = window.setInterval(refresh, 1500);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (!session) {
    return null;
  }

  return (
    <div className={styles.banner} role="status">
      <span className={styles.label}>Звонок: {session.title}</span>
      <button
        type="button"
        className={styles.button}
        onClick={() => focusMeetingDockWindow(session.eventId)}
      >
        Открыть
      </button>
    </div>
  );
}
