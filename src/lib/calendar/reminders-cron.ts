import "server-only";

import { listTeamUsers } from "@/lib/auth/users";
import { notifyCalendarReminder } from "@/lib/notifications/emit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDeletedUserIds } from "@/lib/team/store";
import * as sbDeliveries from "@/lib/supabase/calendar-reminder-deliveries-repo";
import {
  REMINDER_OFFSETS_MINUTES,
} from "./constants";
import {
  getEventScanRangeIso,
  getReminderDeliveryCandidate,
  resolveReminderRecipientIds,
} from "./reminders";
import { listEventsInRangeForReminders } from "./store";
import type {
  CalendarEvent,
  CalendarReminderDelivery,
  InsertCalendarReminderDeliveryInput,
  ReminderOffsetMinutes,
} from "./types";

export type ReminderCronResult = {
  processed: number;
  sent: number;
  skipped: number;
  duplicates: number;
};

export type ReminderCronDeps = {
  listEventsInRange: (
    from: string,
    to: string,
  ) => Promise<CalendarEvent[]>;
  listActiveUserIds: () => Promise<string[]>;
  tryInsertDelivery: (
    input: InsertCalendarReminderDeliveryInput,
  ) => Promise<CalendarReminderDelivery | null>;
  onDelivery?: (params: {
    event: CalendarEvent;
    delivery: CalendarReminderDelivery;
    offsetMinutes: ReminderOffsetMinutes;
  }) => Promise<void>;
};

export async function deliverCalendarReminderNotification(params: {
  event: CalendarEvent;
  delivery: CalendarReminderDelivery;
  offsetMinutes: ReminderOffsetMinutes;
}): Promise<void> {
  const notification = await notifyCalendarReminder({
    event: params.event,
    offsetMinutes: params.offsetMinutes,
    userId: params.delivery.userId,
  });

  if (!isSupabaseConfigured()) return;

  await sbDeliveries.sbUpdateReminderDeliveryNotificationId(
    params.delivery.id,
    notification.id,
  );
}

export const defaultReminderCronDeps: ReminderCronDeps = {
  listEventsInRange: listEventsInRangeForReminders,
  listActiveUserIds: async () => {
    const deleted = new Set(await getDeletedUserIds());
    return listTeamUsers()
      .filter((user) => !deleted.has(user.id))
      .map((user) => user.id);
  },
  tryInsertDelivery: sbDeliveries.sbTryInsertReminderDelivery,
  onDelivery: deliverCalendarReminderNotification,
};

export async function runCalendarReminderCron(
  opts?: {
    now?: Date;
    deps?: Partial<ReminderCronDeps>;
  },
): Promise<ReminderCronResult> {
  const now = opts?.now ?? new Date();
  const nowMs = now.getTime();
  const deps: ReminderCronDeps = {
    ...defaultReminderCronDeps,
    ...opts?.deps,
  };

  const { from, to } = getEventScanRangeIso(nowMs);
  const events = await deps.listEventsInRange(from, to);
  const activeUserIds = await deps.listActiveUserIds();

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const event of events) {
    for (const offsetMinutes of REMINDER_OFFSETS_MINUTES) {
      processed += 1;

      const candidate = getReminderDeliveryCandidate(
        event,
        offsetMinutes,
        nowMs,
      );
      if (typeof candidate === "string") {
        skipped += 1;
        continue;
      }

      const recipientIds = resolveReminderRecipientIds(event, activeUserIds);
      if (!recipientIds.length) {
        skipped += 1;
        continue;
      }

      for (const userId of recipientIds) {
        const delivery = await deps.tryInsertDelivery({
          eventId: event.id,
          userId,
          offsetMinutes: candidate.offsetMinutes,
          fireAt: new Date(candidate.fireTargetMs).toISOString(),
          eventUpdatedAt: event.updatedAt,
        });

        if (!delivery) {
          duplicates += 1;
          continue;
        }

        sent += 1;
        if (deps.onDelivery) {
          await deps.onDelivery({
            event,
            delivery,
            offsetMinutes: candidate.offsetMinutes,
          });
        }
      }
    }
  }

  return { processed, sent, skipped, duplicates };
}
