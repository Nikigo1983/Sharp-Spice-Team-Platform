import type { ReminderOffsetMinutes } from "./constants";

export type { ReminderOffsetMinutes };

export const CALENDAR_SCOPES = ["personal", "company"] as const;

export type CalendarScope = (typeof CALENDAR_SCOPES)[number];

export const CALENDAR_EVENT_TYPES = ["general", "video_meeting"] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const VIDEO_INVITE_MODES = ["all_team", "selected"] as const;

export type VideoInviteMode = (typeof VIDEO_INVITE_MODES)[number];

export type CalendarEvent = {
  id: string;
  companyId: string;
  scope: CalendarScope;
  ownerUserId: string | null;
  title: string;
  description: string;
  eventType: CalendarEventType;
  videoInviteMode: VideoInviteMode | null;
  guestWaitingRoom: boolean;
  participantUserIds: string[];
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string;
  sendReminders: boolean;
  createdByUserId: string;
  createdByName: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCalendarEventInput = {
  scope: CalendarScope;
  ownerUserId: string | null;
  title: string;
  description?: string;
  eventType?: CalendarEventType;
  videoInviteMode?: VideoInviteMode;
  guestWaitingRoom?: boolean;
  participantUserIds?: string[];
  startAt: string;
  endAt: string;
  allDay?: boolean;
  location?: string;
  sendReminders?: boolean;
  createdByUserId: string;
  createdByName: string;
};

export type UpdateCalendarEventInput = {
  title?: string;
  description?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  location?: string;
  sendReminders?: boolean;
  videoInviteMode?: VideoInviteMode;
  guestWaitingRoom?: boolean;
  participantUserIds?: string[];
  updatedByUserId?: string | null;
};

export type CalendarReminderDelivery = {
  id: string;
  eventId: string;
  userId: string;
  offsetMinutes: ReminderOffsetMinutes;
  fireAt: string;
  notificationId: string | null;
  eventUpdatedAt: string;
  createdAt: string;
};

export type InsertCalendarReminderDeliveryInput = {
  eventId: string;
  userId: string;
  offsetMinutes: ReminderOffsetMinutes;
  fireAt: string;
  notificationId?: string | null;
  eventUpdatedAt: string;
};

export const CALENDAR_MEETING_AUDIT_ACTIONS = ["joined", "left"] as const;

export type CalendarMeetingAuditAction =
  (typeof CALENDAR_MEETING_AUDIT_ACTIONS)[number];

export type CalendarMeetingAudit = {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  roomName: string;
  action: CalendarMeetingAuditAction;
  participantType: "team" | "guest";
  occurredAt: string;
};

export type InsertCalendarMeetingAuditInput = {
  eventId: string;
  userId: string;
  userName: string;
  roomName: string;
  action: CalendarMeetingAuditAction;
  participantType?: "team" | "guest";
};

export type CalendarMeetingGuestInvite = {
  id: string;
  eventId: string;
  token: string;
  createdByUserId: string;
  enabled: boolean;
  createdAt: string;
  revokedAt: string | null;
};

export const GUEST_ADMISSION_STATUSES = [
  "pending",
  "admitted",
  "rejected",
  "left",
] as const;

export type GuestAdmissionStatus = (typeof GUEST_ADMISSION_STATUSES)[number];

export type CalendarMeetingGuestAdmission = {
  id: string;
  eventId: string;
  inviteId: string;
  guestId: string;
  displayName: string;
  status: GuestAdmissionStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedByUserId: string | null;
};

export type ListCalendarEventsOptions = {
  from: string;
  to: string;
  scopes?: CalendarScope[];
  /** Required to include personal events for a specific user. */
  ownerUserId?: string;
  viewerUserId?: string;
};
