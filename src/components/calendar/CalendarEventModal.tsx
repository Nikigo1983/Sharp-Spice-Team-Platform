"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MeetingJoinButton } from "@/components/meet/MeetingJoinButton";
import type { SessionUser } from "@/lib/auth/types";
import { CALENDAR_EVENT_TYPE_LABELS } from "@/lib/calendar/constants";
import {
  formatEventTimeRange,
  formatScopeLabel,
} from "@/lib/calendar/format";
import {
  formatMeetingStatusLabel,
  getMeetingAccessPhase,
} from "@/lib/calendar/meeting-client";
import { getMeetingRoomName, isVideoMeeting } from "@/lib/calendar/meeting";
import { formatParticipantNames } from "@/lib/calendar/participants";
import {
  canDeleteEvent,
  canEditEvent,
} from "@/lib/calendar/permissions-client";
import type { CalendarEvent } from "@/lib/calendar/types";
import { useCalendarTimeZone } from "./CalendarTimeZoneContext";
import styles from "./CalendarEventModal.module.css";

type CalendarEventModalProps = {
  event: CalendarEvent;
  user: SessionUser;
  teamMembers: { id: string; name: string }[];
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
};

function meetingStatusClass(phase: ReturnType<typeof getMeetingAccessPhase>): string {
  switch (phase) {
    case "open":
      return styles.statusOpen;
    case "waiting":
      return styles.statusWaiting;
    case "closed":
      return styles.statusClosed;
  }
}

export function CalendarEventModal({
  event,
  user,
  teamMembers,
  onClose,
  onEdit,
  onDelete,
}: CalendarEventModalProps) {
  const { timeZone } = useCalendarTimeZone();
  const canEdit = canEditEvent(user, event);
  const canDelete = canDeleteEvent(user, event);
  const scopeClass =
    event.scope === "personal" ? styles.scopePersonal : styles.scopeCompany;
  const videoMeeting = isVideoMeeting(event);
  const meetingPhase = videoMeeting ? getMeetingAccessPhase(event) : null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="calendar-event-title">
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <Card className={styles.modal}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.badges}>
              {videoMeeting ? (
                <span className={[styles.typeBadge, styles.typeVideo].join(" ")}>
                  {CALENDAR_EVENT_TYPE_LABELS.video_meeting}
                </span>
              ) : null}
              <span className={[styles.scopeBadge, scopeClass].join(" ")}>
                {formatScopeLabel(event.scope)}
              </span>
            </div>
            <h2 id="calendar-event-title" className={styles.title}>
              {event.title}
            </h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <dl className={styles.meta}>
          <div>
            <dt>Время</dt>
            <dd>{formatEventTimeRange(event, timeZone)}</dd>
          </div>
          {videoMeeting ? (
            <>
              <div>
                <dt>Комната</dt>
                <dd className={styles.roomName}>{getMeetingRoomName(event.id)}</dd>
              </div>
              <div>
                <dt>Участники</dt>
                <dd>{formatParticipantNames(event, teamMembers)}</dd>
              </div>
              <div>
                <dt>Статус</dt>
                <dd>
                  <span
                    className={[
                      styles.statusBadge,
                      meetingPhase ? meetingStatusClass(meetingPhase) : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {meetingPhase ? formatMeetingStatusLabel(meetingPhase) : "—"}
                  </span>
                </dd>
              </div>
            </>
          ) : null}
          {event.location ? (
            <div>
              <dt>Место</dt>
              <dd>{event.location}</dd>
            </div>
          ) : null}
          <div>
            <dt>Автор</dt>
            <dd>{event.createdByName}</dd>
          </div>
          <div>
            <dt>Напоминания</dt>
            <dd>{event.sendReminders ? "Включены" : "Выключены"}</dd>
          </div>
        </dl>

        {videoMeeting ? (
          <MeetingJoinButton event={event} timeZone={timeZone} />
        ) : null}

        {event.description ? (
          <p className={styles.description}>{event.description}</p>
        ) : (
          <p className={styles.noDescription}>Описание не указано.</p>
        )}

        <div className={styles.actions}>
          {canEdit ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onClose();
                onEdit(event);
              }}
            >
              Редактировать
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                onClose();
                onDelete(event);
              }}
            >
              Удалить
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </Card>
    </div>
  );
}
