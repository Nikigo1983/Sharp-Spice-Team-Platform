import "server-only";

import { getSupabaseAdmin } from "./server";
import type { CalendarEvent } from "@/lib/calendar/types";
import {
  mapCalendarEventRowToEvent,
  mapCalendarEventToRow,
  type CalendarEventRow,
} from "@/lib/calendar/calendar-event-row-map";

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
  return (data as CalendarEventRow[]).map(mapCalendarEventRowToEvent);
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
  return data ? mapCalendarEventRowToEvent(data as CalendarEventRow) : null;
}

export async function sbInsertCalendarEvent(
  event: CalendarEvent,
): Promise<CalendarEvent> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_events")
    .insert(mapCalendarEventToRow(event))
    .select("*")
    .single();

  if (error) throw error;
  return mapCalendarEventRowToEvent(data as CalendarEventRow);
}

export async function sbUpdateCalendarEvent(
  event: CalendarEvent,
): Promise<CalendarEvent> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_events")
    .update(mapCalendarEventToRow(event))
    .eq("id", event.id)
    .select("*")
    .single();

  if (error) throw error;
  return mapCalendarEventRowToEvent(data as CalendarEventRow);
}

export async function sbDeleteCalendarEvent(id: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("calendar_events")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}
