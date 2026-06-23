import Link from "next/link";
import { CALENDAR_TIMEZONE } from "@/lib/calendar/constants";
import { formatEventTimeRange } from "@/lib/calendar/format";
import { formatMeetingOpensAtLabel } from "@/lib/calendar/meeting-client";
import type { CalendarEvent } from "@/lib/calendar/types";
import styles from "./MeetingAccessGate.module.css";

export type MeetingAccessGateVariant =
  | "waiting"
  | "closed"
  | "not_found"
  | "not_video"
  | "forbidden"
  | "not_configured"
  | "connect_error";

type MeetingAccessGateProps = {
  variant: MeetingAccessGateVariant;
  event?: CalendarEvent;
  eventId?: string;
  message?: string;
};

function getCopy(
  variant: MeetingAccessGateVariant,
  event?: CalendarEvent,
): { title: string; body: string; actionLabel: string; actionHref: string } {
  const eventHref = event
    ? `/calendar?event=${encodeURIComponent(event.id)}`
    : "/calendar";

  switch (variant) {
    case "waiting":
      return {
        title: "Встреча ещё не открыта",
        body: event
          ? `Вход возможен за 15 минут до начала. Откроется в ${formatMeetingOpensAtLabel(event, CALENDAR_TIMEZONE)}.`
          : "Вход возможен за 15 минут до начала.",
        actionLabel: "Вернуться к событию",
        actionHref: eventHref,
      };
    case "closed":
      return {
        title: "Встреча завершена",
        body: "Окно доступа закрыто (окончание + 15 мин).",
        actionLabel: "Открыть событие в календаре",
        actionHref: eventHref,
      };
    case "not_found":
      return {
        title: "Событие не найдено",
        body: "Видеовстреча недоступна или у вас нет доступа.",
        actionLabel: "Перейти в календарь",
        actionHref: "/calendar",
      };
    case "not_video":
      return {
        title: "Это не видеовстреча",
        body: "Присоединиться можно только к событиям типа «Видеовстреча».",
        actionLabel: "Открыть событие",
        actionHref: eventHref,
      };
    case "forbidden":
      return {
        title: "Доступ запрещён",
        body: "Видеовстречи доступны только сотрудникам платформы.",
        actionLabel: "Перейти в календарь",
        actionHref: "/calendar",
      };
    case "not_configured":
      return {
        title: "Видеовстречи не настроены",
        body: "LiveKit не подключён на сервере. Обратитесь к владельцу платформы.",
        actionLabel: "Перейти в календарь",
        actionHref: eventHref,
      };
    case "connect_error":
      return {
        title: "Не удалось подключиться",
        body: "Проверьте интернет и попробуйте снова из карточки события.",
        actionLabel: "Вернуться к событию",
        actionHref: eventHref,
      };
  }
}

export function MeetingAccessGate({
  variant,
  event,
  message,
}: MeetingAccessGateProps) {
  const copy = getCopy(variant, event);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{copy.title}</h1>
        {event ? (
          <p className={styles.eventMeta}>
            {formatEventTimeRange(event)} — {event.title}
          </p>
        ) : null}
        <p className={styles.body}>{message ?? copy.body}</p>
        <Link href={copy.actionHref} className={styles.action}>
          {copy.actionLabel}
        </Link>
      </div>
    </div>
  );
}
