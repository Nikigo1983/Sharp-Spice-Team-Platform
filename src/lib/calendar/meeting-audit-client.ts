import type { CalendarMeetingAuditAction } from "@/lib/calendar/types";

export async function postMeetingAudit(
  eventId: string,
  action: CalendarMeetingAuditAction,
  options?: { keepalive?: boolean },
): Promise<void> {
  await fetch(
    `/api/calendar/events/${encodeURIComponent(eventId)}/meeting-audit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      keepalive: options?.keepalive ?? false,
    },
  );
}

export function postMeetingAuditBeacon(
  eventId: string,
  action: CalendarMeetingAuditAction,
): void {
  void postMeetingAudit(eventId, action, { keepalive: true });
}
