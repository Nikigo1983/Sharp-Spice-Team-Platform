import "server-only";

import { listSubmittedForStaff } from "@/lib/client-portal/questionnaire-service";
import { isCaseArchived } from "@/lib/client-portal/case-archive";
import {
  countUnreadNotificationsByTypes,
  markNotificationsReadByTypes,
} from "@/lib/notifications/store";
import { listOnboardingResponses } from "@/lib/spiora-onboarding/store";
import { listSpioraSurveyResponses } from "@/lib/spiora-survey/store";
import {
  getTeamChatUnreadCount,
  markTeamChatSeen,
} from "@/lib/team-chat/store";
import {
  getNavSectionLastSeen,
  setNavSectionLastSeen,
} from "./last-seen";
import {
  isNavBadgeHref,
  NAV_BADGE_HREFS,
  NAV_BADGE_NOTIFICATION_TYPES,
  type NavBadgeHref,
  type NavBadgesMap,
} from "./types";

function countCreatedAfter(
  items: Array<{ createdAt: string }>,
  lastSeenAt: string | null,
): number {
  if (!lastSeenAt) return items.length;
  const seenMs = Date.parse(lastSeenAt);
  if (Number.isNaN(seenMs)) return items.length;
  return items.filter((item) => {
    const createdMs = Date.parse(item.createdAt);
    return !Number.isNaN(createdMs) && createdMs > seenMs;
  }).length;
}

export async function getNavBadgesForUser(
  userId: string,
): Promise<NavBadgesMap> {
  const [
    formgrid,
    tasks,
    calendar,
    teamChat,
    intakeItems,
    surveyResponses,
    spioraClients,
    surveySeen,
    clientsSeen,
  ] = await Promise.all([
    countUnreadNotificationsByTypes(
      userId,
      NAV_BADGE_NOTIFICATION_TYPES["/new-formgrid-clients"],
    ),
    countUnreadNotificationsByTypes(
      userId,
      NAV_BADGE_NOTIFICATION_TYPES["/tasks"],
    ),
    countUnreadNotificationsByTypes(
      userId,
      NAV_BADGE_NOTIFICATION_TYPES["/calendar"],
    ),
    getTeamChatUnreadCount(userId),
    listSubmittedForStaff().catch(() => []),
    listSpioraSurveyResponses().catch(() => []),
    listOnboardingResponses().catch(() => []),
    getNavSectionLastSeen(userId, "/spiora/survey-responses"),
    getNavSectionLastSeen(userId, "/spiora/clients"),
  ]);

  const intakeNew = intakeItems.filter(
    (item) => !item.staffOpenedAt && !isCaseArchived(item.answers),
  ).length;

  const badges: NavBadgesMap = {};
  const set = (href: NavBadgeHref, count: number) => {
    if (count > 0) badges[href] = count;
  };

  set("/new-formgrid-clients", formgrid);
  set("/clients/intake", intakeNew);
  set(
    "/spiora/survey-responses",
    countCreatedAfter(surveyResponses, surveySeen),
  );
  set("/spiora/clients", countCreatedAfter(spioraClients, clientsSeen));
  set("/tasks", tasks);
  set("/calendar", calendar);
  set("/team-chat", teamChat);

  return badges;
}

export async function markNavBadgeSeen(
  userId: string,
  href: string,
): Promise<boolean> {
  if (!isNavBadgeHref(href)) return false;

  switch (href) {
    case "/team-chat":
      await markTeamChatSeen(userId);
      return true;
    case "/new-formgrid-clients":
    case "/tasks":
    case "/calendar":
      await markNotificationsReadByTypes(
        userId,
        NAV_BADGE_NOTIFICATION_TYPES[href],
      );
      return true;
    case "/spiora/survey-responses":
    case "/spiora/clients":
      await setNavSectionLastSeen(userId, href);
      return true;
    case "/clients/intake":
      // Badge follows per-case staffOpenedAt; visiting the list does not
      // bulk-open cases. Local UI zeros while on the page.
      return true;
    default:
      return false;
  }
}

export function emptyNavBadges(): NavBadgesMap {
  return {};
}

export { NAV_BADGE_HREFS };
