import {
  CALENDAR_DEFAULT_EVENT_TYPE,
  CALENDAR_DEFAULT_SEND_REMINDERS,
  CALENDAR_TIMEZONE,
} from "./constants";
import { formatDateKey } from "./range";
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarScope,
  VideoInviteMode,
} from "./types";
import { formatTimeInZone, zonedDateTimeToUtc } from "./zoned-time";

export type CalendarFormValues = {
  scope: CalendarScope;
  eventType: CalendarEventType;
  videoInviteMode: VideoInviteMode;
  guestWaitingRoom: boolean;
  guestMaxCount: number;
  guestAccessPassword: string;
  linkedClientId: string | null;
  linkedClientName: string | null;
  participantUserIds: string[];
  title: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  location: string;
  sendReminders: boolean;
};

function parseTimeValue(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

export function defaultFormValues(
  anchorDate: Date,
  timeZone: string = CALENDAR_TIMEZONE,
): CalendarFormValues {
  const dateKey = formatDateKey(anchorDate, timeZone);
  return {
    scope: "personal",
    eventType: CALENDAR_DEFAULT_EVENT_TYPE,
    videoInviteMode: "all_team",
    guestWaitingRoom: true,
    guestMaxCount: 10,
    guestAccessPassword: "",
    linkedClientId: null,
    linkedClientName: null,
    participantUserIds: [],
    title: "",
    description: "",
    startDate: dateKey,
    startTime: "10:00",
    endDate: dateKey,
    endTime: "11:00",
    allDay: false,
    location: "",
    sendReminders: CALENDAR_DEFAULT_SEND_REMINDERS,
  };
}

export function eventToFormValues(
  event: CalendarEvent,
  timeZone: string = CALENDAR_TIMEZONE,
): CalendarFormValues {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);

  return {
    scope: event.scope,
    eventType: event.eventType,
    videoInviteMode:
      event.videoInviteMode ??
      (event.scope === "company" ? "all_team" : "selected"),
    participantUserIds: [...(event.participantUserIds ?? [])],
    guestWaitingRoom: event.guestWaitingRoom ?? true,
    guestMaxCount: event.guestMaxCount ?? 10,
    guestAccessPassword: "",
    linkedClientId: event.linkedClientId,
    linkedClientName: event.linkedClientName,
    title: event.title,
    description: event.description,
    startDate: formatDateKey(start, timeZone),
    startTime: formatTimeInZone(start, timeZone),
    endDate: formatDateKey(end, timeZone),
    endTime: formatTimeInZone(end, timeZone),
    allDay: event.allDay,
    location: event.location,
    sendReminders: event.sendReminders,
  };
}

export function formValuesToTimestamps(
  values: CalendarFormValues,
  timeZone: string = CALENDAR_TIMEZONE,
): {
  startAt: string;
  endAt: string;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.startDate)) {
    throw new Error("Invalid start date");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.endDate)) {
    throw new Error("Invalid end date");
  }

  if (values.allDay) {
    return {
      startAt: zonedDateTimeToUtc(
        values.startDate,
        { hours: 0, minutes: 0, seconds: 0 },
        timeZone,
      ).toISOString(),
      endAt: zonedDateTimeToUtc(
        values.endDate,
        { hours: 23, minutes: 59, seconds: 59 },
        timeZone,
      ).toISOString(),
    };
  }

  const startTime = parseTimeValue(values.startTime);
  const endTime = parseTimeValue(values.endTime);
  if (!startTime || !endTime) {
    throw new Error("Invalid time");
  }

  return {
    startAt: zonedDateTimeToUtc(
      values.startDate,
      { hours: startTime.hours, minutes: startTime.minutes, seconds: 0 },
      timeZone,
    ).toISOString(),
    endAt: zonedDateTimeToUtc(
      values.endDate,
      { hours: endTime.hours, minutes: endTime.minutes, seconds: 0 },
      timeZone,
    ).toISOString(),
  };
}

export function validateFormValues(
  values: CalendarFormValues,
  timeZone: string = CALENDAR_TIMEZONE,
): string | null {
  if (!values.title.trim()) {
    return "Укажите название события";
  }

  if (values.eventType === "video_meeting" && values.allDay) {
    return "Видеовстреча не может быть событием на весь день";
  }

  try {
    const { startAt, endAt } = formValuesToTimestamps(values, timeZone);
    if (endAt < startAt) {
      return "Окончание не может быть раньше начала";
    }
  } catch {
    return "Укажите корректные дату и время";
  }

  return null;
}

export function formValuesToCreatePayload(
  values: CalendarFormValues,
  timeZone: string = CALENDAR_TIMEZONE,
) {
  const { startAt, endAt } = formValuesToTimestamps(values, timeZone);

  return {
    scope: values.scope,
    eventType: values.eventType,
    videoInviteMode:
      values.eventType === "video_meeting"
        ? values.scope === "personal"
          ? "selected"
          : values.videoInviteMode
        : undefined,
    participantUserIds:
      values.eventType === "video_meeting" &&
      (values.scope === "personal" || values.videoInviteMode === "selected")
        ? values.participantUserIds
        : undefined,
    title: values.title.trim(),
    description: values.description.trim(),
    startAt,
    endAt,
    allDay: values.allDay,
    location: values.location.trim(),
    sendReminders: values.sendReminders,
    guestWaitingRoom:
      values.eventType === "video_meeting" ? values.guestWaitingRoom : undefined,
    guestMaxCount:
      values.eventType === "video_meeting" ? values.guestMaxCount : undefined,
    guestAccessPassword:
      values.eventType === "video_meeting" && values.guestAccessPassword.trim()
        ? values.guestAccessPassword.trim()
        : values.eventType === "video_meeting"
          ? null
          : undefined,
    linkedClientId:
      values.eventType === "video_meeting" ? values.linkedClientId : undefined,
    linkedClientName:
      values.eventType === "video_meeting" ? values.linkedClientName : undefined,
  };
}

export function formValuesToUpdatePayload(
  values: CalendarFormValues,
  timeZone: string = CALENDAR_TIMEZONE,
) {
  const { startAt, endAt } = formValuesToTimestamps(values, timeZone);

  return {
    title: values.title.trim(),
    description: values.description.trim(),
    startAt,
    endAt,
    allDay: values.allDay,
    location: values.location.trim(),
    sendReminders: values.sendReminders,
    guestWaitingRoom:
      values.eventType === "video_meeting" ? values.guestWaitingRoom : undefined,
    guestMaxCount:
      values.eventType === "video_meeting" ? values.guestMaxCount : undefined,
    guestAccessPassword:
      values.eventType === "video_meeting" && values.guestAccessPassword.trim()
        ? values.guestAccessPassword.trim()
        : values.eventType === "video_meeting"
          ? null
          : undefined,
    videoInviteMode:
      values.eventType === "video_meeting"
        ? values.scope === "personal"
          ? "selected"
          : values.videoInviteMode
        : undefined,
    participantUserIds:
      values.eventType === "video_meeting" &&
      (values.scope === "personal" || values.videoInviteMode === "selected")
        ? values.participantUserIds
        : undefined,
    linkedClientId:
      values.eventType === "video_meeting" ? values.linkedClientId : undefined,
    linkedClientName:
      values.eventType === "video_meeting" ? values.linkedClientName : undefined,
  };
}
