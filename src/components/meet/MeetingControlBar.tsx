"use client";

import { TrackToggle, useRoomContext } from "@livekit/components-react";
import { Track } from "livekit-client";
import { MeetingRecordingButton } from "./MeetingRecordingButton";
import styles from "./MeetingControlBar.module.css";

type MeetingControlBarProps = {
  eventId?: string;
  participantCount: number;
  participantsOpen: boolean;
  onToggleParticipants: () => void;
  onLeave: () => void;
  compact?: boolean;
  hideScreenShare?: boolean;
  pendingGuestCount?: number;
};

export function MeetingControlBar({
  eventId,
  participantCount,
  participantsOpen,
  onToggleParticipants,
  onLeave,
  compact = false,
  hideScreenShare = false,
  pendingGuestCount = 0,
}: MeetingControlBarProps) {
  const room = useRoomContext();

  function handleLeave() {
    room.disconnect();
    onLeave();
  }

  return (
    <footer className={styles.bar}>
      <div className={styles.controls}>
        <TrackToggle
          source={Track.Source.Microphone}
          showIcon={false}
          className={styles.toggle}
          aria-label="Микрофон"
          title="Микрофон"
        >
          <i className="fa-solid fa-microphone" aria-hidden="true" />
        </TrackToggle>
        <TrackToggle
          source={Track.Source.Camera}
          showIcon={false}
          className={styles.toggle}
          aria-label="Камера"
          title="Камера"
        >
          <i className="fa-solid fa-video" aria-hidden="true" />
        </TrackToggle>
        {hideScreenShare ? null : (
        <TrackToggle
          source={Track.Source.ScreenShare}
          showIcon={false}
          className={styles.toggle}
          aria-label="Поделиться экраном"
          title={
            compact
              ? "Демонстрация — выберите основное окно браузера с платформой"
              : "Поделиться экраном — выберите окно с платформой или другим сайтом"
          }
          captureOptions={{
            audio: false,
            selfBrowserSurface: "include",
          }}
        >
          <i className="fa-solid fa-display" aria-hidden="true" />
        </TrackToggle>
        )}
        {eventId ? <MeetingRecordingButton eventId={eventId} /> : null}
        <button
          type="button"
          className={`${styles.toggle} ${participantsOpen ? styles.toggleActive : ""}`}
          aria-label="Участники"
          title="Участники"
          onClick={onToggleParticipants}
        >
          <i className="fa-solid fa-users" aria-hidden="true" />
          <span className={styles.count}>{participantCount}</span>
          {pendingGuestCount > 0 ? (
            <span className={styles.pendingBadge}>{pendingGuestCount}</span>
          ) : null}
        </button>
      </div>
      <button
        type="button"
        className={styles.leave}
        onClick={handleLeave}
        aria-label="Покинуть встречу"
      >
        Покинуть
      </button>
    </footer>
  );
}
