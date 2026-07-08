export const MEETING_DOCK_SESSION_KEY = "ss-meeting-dock-session";
export const MEETING_DOCK_NAVIGATE_KEY = "ss-meeting-dock-navigate";

export type MeetingDockSession = {
  eventId: string;
  title: string;
  openedAt: string;
};

export function getMeetingDockWindowName(eventId: string): string {
  return `ss-meeting-${eventId}`;
}

export function readMeetingDockSession(): MeetingDockSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(MEETING_DOCK_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as MeetingDockSession;
    if (!parsed.eventId || !parsed.title) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function markMeetingDockActive(session: MeetingDockSession): void {
  sessionStorage.setItem(MEETING_DOCK_SESSION_KEY, JSON.stringify(session));
}

export function clearMeetingDockActive(): void {
  sessionStorage.removeItem(MEETING_DOCK_SESSION_KEY);
  sessionStorage.removeItem(MEETING_DOCK_NAVIGATE_KEY);
}

export function markMeetingDockNavigate(eventId: string): void {
  sessionStorage.setItem(MEETING_DOCK_NAVIGATE_KEY, eventId);
}

export function readMeetingDockNavigateEventId(): string | null {
  return sessionStorage.getItem(MEETING_DOCK_NAVIGATE_KEY);
}

export function clearMeetingDockNavigate(): void {
  sessionStorage.removeItem(MEETING_DOCK_NAVIGATE_KEY);
}

export function openMeetingDockWindow(eventId: string): Window | null {
  return window.open(
    `/calendar/meet/${encodeURIComponent(eventId)}?dock=1`,
    getMeetingDockWindowName(eventId),
    "popup=yes,width=420,height=760,resizable=yes,scrollbars=no",
  );
}

export function focusMeetingDockWindow(eventId: string): Window | null {
  const win = window.open("", getMeetingDockWindowName(eventId));
  win?.focus();
  return win;
}

export function closeMeetingDockWindow(eventId: string): void {
  const win = window.open("", getMeetingDockWindowName(eventId));
  win?.close();
}

export function isMeetingDockMode(searchParams: URLSearchParams): boolean {
  return searchParams.get("dock") === "1";
}
