export const CALENDAR_SCOPES = ["personal", "company"] as const;

export type CalendarScope = (typeof CALENDAR_SCOPES)[number];

export const CALENDAR_EVENT_TYPES = ["general"] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export type CalendarEvent = {
  id: string;
  companyId: string;
  scope: CalendarScope;
  ownerUserId: string | null;
  title: string;
  description: string;
  eventType: CalendarEventType;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string;
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
  startAt: string;
  endAt: string;
  allDay?: boolean;
  location?: string;
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
  updatedByUserId?: string | null;
};

export type ListCalendarEventsOptions = {
  from: string;
  to: string;
  scopes?: CalendarScope[];
  /** Required to include personal events for a specific user. */
  ownerUserId?: string;
};
