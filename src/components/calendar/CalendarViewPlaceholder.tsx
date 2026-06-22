import { CALENDAR_SCOPE_COLORS } from "@/lib/calendar/constants";
import type { CalendarEvent } from "@/lib/calendar/types";
import type { CalendarViewMode } from "@/lib/calendar/range";
import styles from "./CalendarViewPlaceholder.module.css";

type CalendarViewPlaceholderProps = {
  view: CalendarViewMode;
  events: CalendarEvent[];
};

const VIEW_LABELS: Record<CalendarViewMode, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
};

export function CalendarViewPlaceholder({
  view,
  events,
}: CalendarViewPlaceholderProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h3 className={styles.title}>Режим «{VIEW_LABELS[view]}»</h3>
        <p className={styles.subtitle}>
          Сетка просмотра появится в следующих релизах. Сейчас загружено{" "}
          <strong>{events.length}</strong>{" "}
          {events.length === 1
            ? "событие"
            : events.length < 5
              ? "события"
              : "событий"}
          .
        </p>
      </div>

      <ul className={styles.list}>
        {events.map((event) => (
          <li key={event.id} className={styles.item}>
            <span
              className={styles.scopeDot}
              style={{ backgroundColor: CALENDAR_SCOPE_COLORS[event.scope] }}
              aria-hidden
            />
            <div className={styles.itemBody}>
              <span className={styles.itemTitle}>{event.title}</span>
              <span className={styles.itemMeta}>
                {event.scope === "personal" ? "Личное" : "Компания"} ·{" "}
                {new Date(event.startAt).toLocaleString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
