import { partitionDayAgenda } from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";
import { CalendarEventChip } from "./CalendarEventChip";
import styles from "./CalendarDayAgenda.module.css";

type CalendarDayAgendaProps = {
  events: CalendarEvent[];
};

export function CalendarDayAgenda({ events }: CalendarDayAgendaProps) {
  const { allDay, timed } = partitionDayAgenda(events);

  return (
    <div className={styles.wrap}>
      {allDay.length > 0 ? (
        <section className={styles.section} aria-label="События на весь день">
          <h3 className={styles.sectionTitle}>Весь день</h3>
          <ul className={styles.list}>
            {allDay.map((event) => (
              <li key={event.id}>
                <CalendarEventChip event={event} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {timed.length > 0 ? (
        <section className={styles.section} aria-label="События по времени">
          {allDay.length === 0 ? (
            <h3 className={styles.sectionTitle}>Расписание дня</h3>
          ) : null}
          <ul className={styles.list}>
            {timed.map((event) => (
              <li key={event.id}>
                <CalendarEventChip event={event} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
