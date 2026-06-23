export const CALENDAR_COMPANY_ID = "sharp-spice";

export const CALENDAR_TIMEZONE = "Europe/Zagreb";

export const CALENDAR_SCOPE_COLORS = {
  personal: "#3B82F6",
  company: "#22C55E",
} as const;

export const CALENDAR_DEFAULT_EVENT_TYPE = "general" as const;

export const CALENDAR_DEFAULT_SEND_REMINDERS = true;

/** Fixed reminder offsets (minutes before effective event start). */
export const REMINDER_OFFSETS_MINUTES = [1440, 60] as const;

export type ReminderOffsetMinutes = (typeof REMINDER_OFFSETS_MINUTES)[number];

/** Vercel cron interval — keep in sync with vercel.json (PR #3). */
export const REMINDER_CRON_INTERVAL_MS = 5 * 60 * 1000;

/** How late a cron tick may still deliver a reminder. */
export const REMINDER_GRACE_WINDOW_MS = 10 * 60 * 1000;

/** Upper bound of the fire window (matches cron interval). */
export const REMINDER_CRON_WINDOW_MS = REMINDER_CRON_INTERVAL_MS;
