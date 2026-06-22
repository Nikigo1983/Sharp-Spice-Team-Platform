"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { SessionUser } from "@/lib/auth/types";
import {
  formatEventTimeRange,
  formatScopeLabel,
} from "@/lib/calendar/format";
import {
  canDeleteEvent,
  canEditEvent,
} from "@/lib/calendar/permissions-client";
import type { CalendarEvent } from "@/lib/calendar/types";
import styles from "./CalendarEventModal.module.css";

type CalendarEventModalProps = {
  event: CalendarEvent;
  user: SessionUser;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
};

export function CalendarEventModal({
  event,
  user,
  onClose,
  onEdit,
  onDelete,
}: CalendarEventModalProps) {
  const canEdit = canEditEvent(user, event);
  const canDelete = canDeleteEvent(user, event);
  const scopeClass =
    event.scope === "personal" ? styles.scopePersonal : styles.scopeCompany;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="calendar-event-title">
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <Card className={styles.modal}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <span className={[styles.scopeBadge, scopeClass].join(" ")}>
              {formatScopeLabel(event.scope)}
            </span>
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
            <dd>{formatEventTimeRange(event)}</dd>
          </div>
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
        </dl>

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
