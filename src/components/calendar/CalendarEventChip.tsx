"use client";

import { CALENDAR_SCOPE_COLORS } from "@/lib/calendar/constants";
import {
  formatEventTimeRange,
  formatScopeLabel,
} from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";
import { useCalendarTimeZone } from "./CalendarTimeZoneContext";
import styles from "./CalendarEventChip.module.css";

type CalendarEventChipProps = {
  event: CalendarEvent;
  variant?: "agenda" | "month";
  onClick?: (event: CalendarEvent) => void;
};

export function CalendarEventChip({
  event,
  variant = "agenda",
  onClick,
}: CalendarEventChipProps) {
  const { timeZone } = useCalendarTimeZone();
  const scopeClass =
    event.scope === "personal" ? styles.personal : styles.company;
  const timeRange = formatEventTimeRange(event, timeZone);

  if (variant === "month") {
    return (
      <button
        type="button"
        className={[styles.monthChip, scopeClass].join(" ")}
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          onClick?.(event);
        }}
        aria-label={`${event.title}, ${formatScopeLabel(event.scope)}`}
        title={event.title}
      >
        <span className={styles.monthTitle}>{event.title}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={[styles.chip, scopeClass].join(" ")}
      onClick={() => onClick?.(event)}
      aria-label={`${event.title}, ${formatScopeLabel(event.scope)}, ${timeRange}`}
    >
      <span className={styles.time}>{timeRange}</span>
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
