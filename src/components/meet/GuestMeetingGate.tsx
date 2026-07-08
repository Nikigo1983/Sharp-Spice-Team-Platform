import { CALENDAR_TIMEZONE } from "@/lib/calendar/constants";
import { formatEventTimeRange } from "@/lib/calendar/format";
import { formatMeetingOpensAtLabel } from "@/lib/calendar/meeting-client";
import type { CalendarEvent } from "@/lib/calendar/types";
import styles from "./GuestMeetingGate.module.css";

export type GuestMeetingGateVariant =
  | "waiting"
  | "closed"
  | "invalid_invite"
  | "not_configured"
  | "left";

type GuestMeetingGateProps = {
  variant: GuestMeetingGateVariant;
  event?: CalendarEvent;
  message?: string;
};

function getCopy(
  variant: GuestMeetingGateVariant,
  event?: CalendarEvent,
): { title: string; body: string } {
  switch (variant) {
    case "waiting":
      return {
        title: "Встреча ещё не открыта",
        body: event
          ? `Подключение станет доступно за 15 минут до начала. Откроется в ${formatMeetingOpensAtLabel(event, CALENDAR_TIMEZONE)}.`
          : "Подключение станет доступно за 15 минут до начала.",
      };
    case "closed":
      return {
        title: "Встреча завершена",
        body: "Окно доступа по этой ссылке закрыто.",
      };
    case "invalid_invite":
      return {
        title: "Ссылка недействительна",
        body: "Приглашение не найдено или было отозвано. Попросите организатора отправить новую ссылку.",
      };
    case "not_configured":
      return {
        title: "Видеовстреча недоступна",
        body: "Сервис видеозвонков временно не настроен. Свяжитесь с организатором встречи.",
      };
    case "left":
      return {
        title: "Вы покинули встречу",
        body: "Спасибо за участие. Чтобы вернуться, обновите страницу и снова введите имя.",
      };
  }
}

export function GuestMeetingGate({
  variant,
  event,
  message,
}: GuestMeetingGateProps) {
  const copy = getCopy(variant, event);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.brand}>Sharp & Spice</p>
        <h1 className={styles.title}>{copy.title}</h1>
        {event ? (
          <p className={styles.eventMeta}>
            {event.title}
            <br />
            {formatEventTimeRange(event, CALENDAR_TIMEZONE)}
          </p>
        ) : null}
        <p className={styles.body}>{message ?? copy.body}</p>
      </div>
    </div>
  );
}
