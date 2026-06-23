import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "./server";
import type {
  CalendarReminderDelivery,
  InsertCalendarReminderDeliveryInput,
} from "@/lib/calendar/types";

type CalendarReminderDeliveryRow = {
  id: string;
  event_id: string;
  user_id: string;
  offset_minutes: number;
  fire_at: string;
  notification_id: string | null;
  event_updated_at: string;
  created_at: string;
};

function mapRow(row: CalendarReminderDeliveryRow): CalendarReminderDelivery {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    offsetMinutes: row.offset_minutes as CalendarReminderDelivery["offsetMinutes"],
    fireAt: row.fire_at,
    notificationId: row.notification_id,
    eventUpdatedAt: row.event_updated_at,
    createdAt: row.created_at,
  };
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

/**
 * Inserts a delivery row. Returns null if (event_id, user_id, offset) already exists.
 */
export async function sbTryInsertReminderDelivery(
  input: InsertCalendarReminderDeliveryInput,
): Promise<CalendarReminderDelivery | null> {
  const row = {
    id: randomUUID(),
    event_id: input.eventId,
    user_id: input.userId,
    offset_minutes: input.offsetMinutes,
    fire_at: input.fireAt,
    notification_id: input.notificationId ?? null,
    event_updated_at: input.eventUpdatedAt,
  };

  const { data, error } = await getSupabaseAdmin()
    .from("calendar_reminder_deliveries")
    .insert(row)
    .select("*")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }

  return data ? mapRow(data as CalendarReminderDeliveryRow) : null;
}

export async function sbDeleteReminderDeliveriesByEventId(
  eventId: string,
): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_reminder_deliveries")
    .delete()
    .eq("event_id", eventId)
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}

export async function sbListReminderDeliveriesByEventId(
  eventId: string,
): Promise<CalendarReminderDelivery[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_reminder_deliveries")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as CalendarReminderDeliveryRow[]).map(mapRow);
}

export async function sbUpdateReminderDeliveryNotificationId(
  deliveryId: string,
  notificationId: string,
): Promise<CalendarReminderDelivery | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_reminder_deliveries")
    .update({ notification_id: notificationId })
    .eq("id", deliveryId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as CalendarReminderDeliveryRow) : null;
}
