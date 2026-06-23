"use client";

import {
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import styles from "./MeetingParticipantPanel.module.css";

type MeetingParticipantPanelProps = {
  onClose: () => void;
};

function trackEnabled(
  participant: ReturnType<typeof useParticipants>[number],
  source: Track.Source,
): boolean {
  const publication = participant.getTrackPublication(source);
  return Boolean(publication && !publication.isMuted);
}

export function MeetingParticipantPanel({
  onClose,
}: MeetingParticipantPanelProps) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  return (
    <aside className={styles.panel} aria-label="Участники">
      <div className={styles.header}>
        <h2 className={styles.title}>Участники ({participants.length})</h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>
      <ul className={styles.list}>
        {participants.map((participant) => {
          const isLocal = participant.identity === localParticipant.identity;
          const name = participant.name || participant.identity;
          const micOn = trackEnabled(participant, Track.Source.Microphone);
          const camOn = trackEnabled(participant, Track.Source.Camera);

          return (
            <li key={participant.identity} className={styles.item}>
              <div className={styles.nameRow}>
                <span className={styles.statusDot} aria-hidden="true" />
                <span className={styles.name}>
                  {name}
                  {isLocal ? " (Вы)" : ""}
                </span>
              </div>
              <div className={styles.tracks}>
                <span>{micOn ? "🎤 вкл" : "🎤 выкл"}</span>
                <span>{camOn ? "📷 вкл" : "📷 выкл"}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={styles.note}>Только сотрудники платформы</p>
    </aside>
  );
}
