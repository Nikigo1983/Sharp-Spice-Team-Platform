import "server-only";

import * as sbDeliveries from "@/lib/supabase/calendar-reminder-deliveries-repo";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { CalendarEvent, UpdateCalendarEventInput } from "./types";

export function shouldResetReminderDeliveriesOnUpdate(
  existing: CalendarEvent,
  input: UpdateCalendarEventInput,
): boolean {
  if (input.startAt !== undefined && input.startAt !== existing.startAt) {
    return true;
  }
  if (input.allDay !== undefined && input.allDay !== existing.allDay) {
    return true;
  }
  if (input.sendReminders === true && !existing.sendReminders) {
    return true;
  }
  return false;
}

export async function deleteReminderDeliveriesByEventId(
  eventId: string,
): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  return sbDeliveries.sbDeleteReminderDeliveriesByEventId(eventId);
}
