import "server-only";

import { getSupabaseAdmin } from "./server";
import type { CalendarEvent } from "@/lib/calendar/types";

type CalendarEventRow = {
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
  created_by_user_id: string;
  created_by_name: string;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: CalendarEventRow): CalendarEvent {
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
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(event: CalendarEvent): CalendarEventRow {
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
    created_by_user_id: event.createdByUserId,
    created_by_name: event.createdByName,
    updated_by_user_id: event.updatedByUserId,
    created_at: event.createdAt,
    updated_at: event.updatedAt,
  };
}

export async function sbListEventsInRange(
  companyId: string,
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_events")
    .select("*")
    .eq("company_id", companyId)
    .lt("start_at", to)
    .gt("end_at", from)
    .order("start_at", { ascending: true });

  if (error) throw error;
  return (data as CalendarEventRow[]).map(mapRow);
}

export async function sbGetCalendarEvent(
  id: string,
): Promise<CalendarEvent | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as CalendarEventRow) : null;
}

export async function sbInsertCalendarEvent(
  event: CalendarEvent,
): Promise<CalendarEvent> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_events")
    .insert(mapEvent(event))
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data as CalendarEventRow);
}

export async function sbUpdateCalendarEvent(
  event: CalendarEvent,
): Promise<CalendarEvent> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_events")
    .update(mapEvent(event))
    .eq("id", event.id)
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data as CalendarEventRow);
}

export async function sbDeleteCalendarEvent(id: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("calendar_events")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}
