"use client";

import { TrackToggle, useRoomContext } from "@livekit/components-react";
import { Track } from "livekit-client";
import styles from "./MeetingControlBar.module.css";

type MeetingControlBarProps = {
  participantCount: number;
  participantsOpen: boolean;
  onToggleParticipants: () => void;
  onLeave: () => void;
};

export function MeetingControlBar({
  participantCount,
  participantsOpen,
  onToggleParticipants,
  onLeave,
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
        <TrackToggle
          source={Track.Source.ScreenShare}
          showIcon={false}
          className={styles.toggle}
          aria-label="Поделиться экраном"
          title="Поделиться экраном"
          captureOptions={{
            audio: false,
            selfBrowserSurface: "include",
          }}
        >
          <i className="fa-solid fa-display" aria-hidden="true" />
        </TrackToggle>
        <button
          type="button"
          className={`${styles.toggle} ${participantsOpen ? styles.toggleActive : ""}`}
          aria-label="Участники"
          title="Участники"
          onClick={onToggleParticipants}
        >
          <i className="fa-solid fa-users" aria-hidden="true" />
          <span className={styles.count}>{participantCount}</span>
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
