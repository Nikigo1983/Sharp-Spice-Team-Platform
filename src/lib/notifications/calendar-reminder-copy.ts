import { formatEventTimeRange } from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";
import type { ReminderOffsetMinutes } from "@/lib/calendar/constants";

const EVENT_ID_SEPARATOR = "\u2063";

export function getCalendarReminderTitle(
  offsetMinutes: ReminderOffsetMinutes,
): string {
  if (offsetMinutes === 1440) {
    return "Напоминание: завтра";
  }
  return "Напоминание: через 1 час";
}

export function formatCalendarReminderDisplayMessage(
  event: CalendarEvent,
): string {
  const time = formatEventTimeRange(event);
  return `${time} — ${event.title}`;
}

export function encodeCalendarReminderMessage(
  displayMessage: string,
  eventId: string,
): string {
  return `${displayMessage}${EVENT_ID_SEPARATOR}${eventId}`;
}

export function decodeCalendarReminderMessage(message: string): {
  display: string;
  eventId: string | null;
} {
  const separatorIndex = message.lastIndexOf(EVENT_ID_SEPARATOR);
  if (separatorIndex === -1) {
    return { display: message, eventId: null };
  }

  const display = message.slice(0, separatorIndex);
  const eventId = message.slice(separatorIndex + 1);
  return { display, eventId: eventId || null };
}

export function buildCalendarReminderNotificationContent(
  event: CalendarEvent,
  offsetMinutes: ReminderOffsetMinutes,
): { title: string; message: string } {
  const displayMessage = formatCalendarReminderDisplayMessage(event);
  return {
    title: getCalendarReminderTitle(offsetMinutes),
    message: encodeCalendarReminderMessage(displayMessage, event.id),
  };
}
