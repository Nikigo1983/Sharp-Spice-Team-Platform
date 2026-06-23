import type { CalendarEvent } from "./types";

export type CalendarEventRow = {
  id: string;
  company_id: string;
  scope: CalendarEvent["scope"];
  owner_user_id: string | null;
  title: string;
  description: string;
  event_type: CalendarEvent["eventType"];
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string;
  send_reminders: boolean;
  created_by_user_id: string;
  created_by_name: string;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export function mapCalendarEventRowToEvent(
  row: CalendarEventRow,
): CalendarEvent {
  return {
    id: row.id,
    companyId: row.company_id,
    scope: row.scope,
    ownerUserId: row.owner_user_id,
    title: row.title,
    description: row.description,
    eventType: row.event_type,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    location: row.location,
    sendReminders: row.send_reminders,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCalendarEventToRow(event: CalendarEvent): CalendarEventRow {
  return {
    id: event.id,
    company_id: event.companyId,
    scope: event.scope,
    owner_user_id: event.ownerUserId,
    title: event.title,
    description: event.description,
    event_type: event.eventType,
    start_at: event.startAt,
    end_at: event.endAt,
    all_day: event.allDay,
    location: event.location,
    send_reminders: event.sendReminders,
    created_by_user_id: event.createdByUserId,
    created_by_name: event.createdByName,
    updated_by_user_id: event.updatedByUserId,
    created_at: event.createdAt,
    updated_at: event.updatedAt,
  };
}
