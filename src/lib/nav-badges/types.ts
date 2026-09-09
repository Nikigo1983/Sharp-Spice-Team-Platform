import type { NotificationType } from "@/lib/notifications/types";

/** Nav hrefs that can show unread/new badges. */
export const NAV_BADGE_HREFS = [
  "/new-formgrid-clients",
  "/clients/intake",
  "/spiora/survey-responses",
  "/spiora/clients",
  "/tasks",
  "/calendar",
  "/team-chat",
] as const;

export type NavBadgeHref = (typeof NAV_BADGE_HREFS)[number];

export type NavBadgesMap = Partial<Record<NavBadgeHref, number>>;

export const NAV_BADGE_NOTIFICATION_TYPES: Record<
  Extract<
    NavBadgeHref,
    "/new-formgrid-clients" | "/tasks" | "/calendar"
  >,
  NotificationType[]
> = {
  "/new-formgrid-clients": ["client_new", "consultation_assigned"],
  "/tasks": [
    "task_new",
    "task_status",
    "task_completed",
    "task_pending_approval",
    "task_revision",
  ],
  "/calendar": [
    "calendar_reminder",
    "calendar_video_invite",
    "meeting_recording_ready",
  ],
};

export function isNavBadgeHref(value: string): value is NavBadgeHref {
  return (NAV_BADGE_HREFS as readonly string[]).includes(value);
}

export function pathnameToNavBadgeHref(pathname: string): NavBadgeHref | null {
  for (const href of NAV_BADGE_HREFS) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return href;
    }
  }
  return null;
}
