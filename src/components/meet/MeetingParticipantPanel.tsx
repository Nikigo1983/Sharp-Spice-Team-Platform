"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import type { CalendarMeetingGuestAdmission } from "@/lib/calendar/types";
import { isGuestParticipantId } from "@/lib/calendar/meeting-guest-client";
import styles from "./MeetingParticipantPanel.module.css";

type MeetingParticipantPanelProps = {
  onClose: () => void;
  eventId?: string;
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
  eventId,
}: MeetingParticipantPanelProps) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [pendingAdmissions, setPendingAdmissions] = useState<
    CalendarMeetingGuestAdmission[]
  >([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    if (!eventId) {
      return;
    }

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
    if (!eventId) {
      return;
    }

    void loadPending();
    const intervalId = window.setInterval(() => {
      void loadPending();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [eventId, loadPending]);

  async function handleDecision(
    admissionId: string,
    decision: "admit" | "reject",
  ) {
    if (!eventId || decidingId) {
      return;
    }

    setDecidingId(admissionId);
    try {
      const response = await fetch(
        `/api/calendar/events/${encodeURIComponent(eventId)}/guest-admissions/${encodeURIComponent(admissionId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      if (response.ok) {
        await loadPending();
      }
    } finally {
      setDecidingId(null);
    }
  }

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

      {eventId && pendingAdmissions.length > 0 ? (
        <section className={styles.waitingSection}>
          <h3 className={styles.waitingTitle}>
            Зал ожидания ({pendingAdmissions.length})
          </h3>
          <ul className={styles.waitingList}>
            {pendingAdmissions.map((admission) => (
              <li key={admission.id} className={styles.waitingItem}>
                <span className={styles.waitingName}>{admission.displayName}</span>
                <div className={styles.waitingActions}>
                  <button
                    type="button"
                    className={styles.admitButton}
                    disabled={decidingId === admission.id}
                    onClick={() => void handleDecision(admission.id, "admit")}
                  >
                    Впустить
                  </button>
                  <button
                    type="button"
                    className={styles.rejectButton}
                    disabled={decidingId === admission.id}
                    onClick={() => void handleDecision(admission.id, "reject")}
                  >
                    Отклонить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className={styles.list}>
        {participants.map((participant) => {
          const isLocal = participant.identity === localParticipant.identity;
          const name = participant.name || participant.identity;
          const micOn = trackEnabled(participant, Track.Source.Microphone);
          const camOn = trackEnabled(participant, Track.Source.Camera);
          const isGuest = isGuestParticipantId(participant.identity);

          return (
            <li key={participant.identity} className={styles.item}>
              <div className={styles.nameRow}>
                <span className={styles.statusDot} aria-hidden="true" />
                <span className={styles.name}>
                  {name}
                  {isLocal ? " (Вы)" : ""}
                  {isGuest ? (
                    <span className={styles.guestBadge}>Гость</span>
                  ) : null}
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
      <p className={styles.note}>
        {eventId
          ? "Сотрудники и принятые гости"
          : "Только сотрудники платформы"}
      </p>
    </aside>
  );
}
