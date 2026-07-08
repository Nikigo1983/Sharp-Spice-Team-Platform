import { CALENDAR_TIMEZONE } from "./constants";
import { formatDayLabel, formatEventTimeRange } from "./format";
import type { CalendarEvent } from "./types";

function greetingForMeetingHour(hour: number): string {
  if (hour < 12) {
    return "Доброе утро";
  }
  if (hour < 18) {
    return "Добрый день";
  }
  return "Добрый вечер";
}

function meetingStartHour(event: CalendarEvent, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("ru-RU", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(new Date(event.startAt)),
  );
}

export function buildGuestMeetingInviteText(
  event: CalendarEvent,
  guestJoinUrl: string,
  options?: {
    recipientName?: string | null;
    timeZone?: string;
  },
): string {
  const timeZone = options?.timeZone ?? CALENDAR_TIMEZONE;
  const greeting = greetingForMeetingHour(meetingStartHour(event, timeZone));
  const recipientName = options?.recipientName?.trim();
  const salutation = recipientName ? `${greeting}, ${recipientName}!` : `${greeting}!`;
  const dateLabel = formatDayLabel(new Date(event.startAt), timeZone);
  const timeRange = formatEventTimeRange(event, timeZone);
  const scheduleLine = event.allDay
    ? `${dateLabel}, весь день`
    : `${dateLabel}, ${timeRange}`;

  return [
    salutation,
    "",
    `Приглашаем вас на видеовстречу «${event.title.trim()}».`,
    "",
    `Когда: ${scheduleLine}`,
    "",
    "Подключиться можно по ссылке (регистрация не нужна):",
    guestJoinUrl,
    "",
    "До встречи!",
    "Команда Sharp & Spice",
  ].join("\n");
}
