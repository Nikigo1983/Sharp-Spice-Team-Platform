/**
 * PWA / installed-app icon badge (Badging API).
 * Works for installed PWAs on Chromium/Edge (desktop).
 * Does not work for plain .lnk browser shortcuts.
 *
 * Also mirrors unread into the document title — kept sticky against Next.js
 * metadata resets via a MutationObserver.
 */

const TITLE_BADGE_RE = /^\(\d+\)\s+/;
const TITLE_BASE = "Sharp & Spice";

let notificationsUnread = 0;
let teamChatUnread = 0;
let titleObserver: MutationObserver | null = null;
let titleWatchStarted = false;

export function canUseAppBadge(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.setAppBadge === "function"
  );
}

export function isRunningAsInstalledPwa(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  } catch {
    // ignore
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function combinedUnread(): number {
  return Math.max(
    Math.max(0, Math.floor(notificationsUnread)),
    Math.max(0, Math.floor(teamChatUnread)),
  );
}

function syncDocumentTitleBadge(count: number): void {
  if (typeof document === "undefined") return;
  const raw = document.title.replace(TITLE_BADGE_RE, "").trim();
  const base = raw || TITLE_BASE;
  const next = count > 0 ? `(${count}) ${base}` : base;
  if (document.title !== next) {
    document.title = next;
  }
}

function ensureTitleWatch(): void {
  if (typeof document === "undefined" || titleWatchStarted) return;
  titleWatchStarted = true;

  const attach = () => {
    const titleEl = document.querySelector("title");
    if (!titleEl) return;
    if (!titleObserver) {
      titleObserver = new MutationObserver(() => {
        syncDocumentTitleBadge(combinedUnread());
      });
      titleObserver.observe(titleEl, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  };

  attach();
  window.setInterval(attach, 2000);
}

async function applyBadge(count: number): Promise<void> {
  const safe = Math.max(0, Math.floor(count));
  ensureTitleWatch();
  syncDocumentTitleBadge(safe);

  const errors: unknown[] = [];

  if (canUseAppBadge()) {
    try {
      if (safe <= 0) {
        await navigator.clearAppBadge?.();
      } else {
        await navigator.setAppBadge(safe);
      }
    } catch (error) {
      errors.push(error);
    }
  }

  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({
        type: "SS_SET_BADGE",
        count: safe,
      });
      // Badging on ServiceWorkerRegistration is Chromium/Edge; not in lib.dom yet.
      const badging = registration as ServiceWorkerRegistration & {
        setAppBadge?: (count?: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
      };
      if (typeof badging.setAppBadge === "function") {
        if (safe <= 0) {
          await badging.clearAppBadge?.();
        } else {
          await badging.setAppBadge(safe);
        }
      }
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    console.warn("[ss] app badge update failed", errors);
  }
}

/** Bell / notifications table unread. */
export async function setNotificationsUnreadForBadge(
  count: number,
): Promise<void> {
  notificationsUnread = Math.max(0, Math.floor(count));
  await applyBadge(combinedUnread());
}

/** Team chat sidebar unread (covers lag before notification rows arrive). */
export async function setTeamChatUnreadForBadge(count: number): Promise<void> {
  teamChatUnread = Math.max(0, Math.floor(count));
  await applyBadge(combinedUnread());
}

/** @deprecated Prefer setNotificationsUnreadForBadge / setTeamChatUnreadForBadge */
export async function setAppUnreadBadge(count: number): Promise<void> {
  await setNotificationsUnreadForBadge(count);
}

export async function clearAppUnreadBadge(): Promise<void> {
  notificationsUnread = 0;
  teamChatUnread = 0;
  await applyBadge(0);
}

export type BadgeTestResult = {
  apiSupported: boolean;
  standalone: boolean;
  title: string;
  error?: string;
};

/** Manual QA from the bell panel. */
export async function forceAppBadgeForTest(
  count: number,
): Promise<BadgeTestResult> {
  const standalone = isRunningAsInstalledPwa();
  const apiSupported = canUseAppBadge();
  try {
    await applyBadge(count);
    if (apiSupported && count > 0) {
      try {
        await navigator.setAppBadge();
        await navigator.setAppBadge(count);
      } catch {
        // ignore
      }
    }
    return {
      apiSupported,
      standalone,
      title: typeof document !== "undefined" ? document.title : "",
    };
  } catch (error) {
    return {
      apiSupported,
      standalone,
      title: typeof document !== "undefined" ? document.title : "",
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}
