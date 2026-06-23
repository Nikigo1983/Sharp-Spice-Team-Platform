"use client";

import { useRouter } from "next/navigation";
import { getMeetingRoomName, isVideoMeeting } from "@/lib/calendar/meeting";
import {
  formatMeetingOpensAtLabel,
  getMeetingAccessPhase,
} from "@/lib/calendar/meeting-client";
import type { CalendarEvent } from "@/lib/calendar/types";
import styles from "./MeetingJoinButton.module.css";

type MeetingJoinButtonProps = {
  event: CalendarEvent;
  timeZone: string;
};

export function MeetingJoinButton({ event, timeZone }: MeetingJoinButtonProps) {
  const router = useRouter();

  if (!isVideoMeeting(event)) {
    return null;
  }

  const phase = getMeetingAccessPhase(event);
  const disabled = phase !== "open";

  function handleJoin() {
    if (disabled) {
      return;
    }
    router.push(`/calendar/meet/${encodeURIComponent(event.id)}`);
  }

  let hint: string | null = null;
  if (phase === "waiting") {
    hint = `Откроется за 15 мин до начала (${formatMeetingOpensAtLabel(event, timeZone)})`;
  } else if (phase === "closed") {
    hint = "Встреча завершена";
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.joinButton}
        disabled={disabled}
        onClick={handleJoin}
        aria-label="Присоединиться к видеовстрече"
      >
        <i className="fa-solid fa-video" aria-hidden="true" />
        Присоединиться к видеовстрече
      </button>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}
