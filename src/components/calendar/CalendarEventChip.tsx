import { CALENDAR_SCOPE_COLORS } from "@/lib/calendar/constants";
import {
  formatEventTimeRange,
  formatScopeLabel,
} from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";
import styles from "./CalendarEventChip.module.css";

type CalendarEventChipProps = {
  event: CalendarEvent;
  onClick?: (event: CalendarEvent) => void;
};

export function CalendarEventChip({ event, onClick }: CalendarEventChipProps) {
  const scopeClass =
    event.scope === "personal" ? styles.personal : styles.company;

  return (
    <button
      type="button"
      className={[styles.chip, scopeClass].join(" ")}
      onClick={() => onClick?.(event)}
      aria-label={`${event.title}, ${formatScopeLabel(event.scope)}, ${formatEventTimeRange(event)}`}
    >
      <span className={styles.time}>{formatEventTimeRange(event)}</span>
      <span className={styles.body}>
        <span className={styles.title}>{event.title}</span>
        <span className={styles.scope}>{formatScopeLabel(event.scope)}</span>
      </span>
      <span
        className={styles.accent}
        style={{ backgroundColor: CALENDAR_SCOPE_COLORS[event.scope] }}
        aria-hidden
      />
    </button>
  );
}
