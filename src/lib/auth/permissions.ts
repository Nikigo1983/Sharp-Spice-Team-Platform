import type { NavEntry, NavGroup, NavItem } from "@/components/layout/Sidebar";
import { MARKETING_SITE_URL } from "@/lib/brand";
import type { SessionUser, UserRole } from "./types";

const NAV_DASHBOARD: NavItem = {
  href: "/dashboard",
  label: "Dashboard",
  icon: "fa-solid fa-gauge-high",
};

const NAV_CLIENTS: NavItem = {
  href: "/clients",
  label: "Клиенты",
  icon: "fa-solid fa-users",
};

const NAV_CRM_LEADS: NavItem = {
  href: "/crm/leads",
  label: "Новые лиды",
  icon: "fa-solid fa-inbox",
};

const NAV_NEW_FORMGRID_CLIENTS: NavItem = {
  href: "/new-formgrid-clients",
  label: "Новые клиенты из анкеты",
  icon: "fa-solid fa-user-plus",
};

const NAV_CLIENT_INVITATIONS: NavItem = {
  href: "/client-invitations",
  label: "Приглашения клиентов",
  icon: "fa-solid fa-envelope-open-text",
};

const NAV_CLIENT_INTAKE: NavItem = {
  href: "/clients/intake",
  label: "Заявки с портала Emigrant",
  icon: "fa-solid fa-clipboard-list",
};

const NAV_FINANCE: NavItem = {
  href: "/finance",
  label: "Финансы",
  icon: "fa-solid fa-euro-sign",
};

const NAV_SPIORA_SURVEY: NavItem = {
  href: "/spiora/survey",
  label: "Анкета для потенциального клиента SPIORA",
  icon: "fa-solid fa-file-lines",
};

const NAV_SPIORA_RESPONSES: NavItem = {
  href: "/spiora/survey-responses",
  label: "Ответы по анкете потенциальных клиентов",
  icon: "fa-solid fa-table-list",
};

export const SPIORA_NAV_CHILDREN: NavItem[] = [
  NAV_SPIORA_SURVEY,
  NAV_SPIORA_RESPONSES,
];

function buildSpioraNav(): NavGroup {
  return {
    id: "spiora",
    label: "Spiora",
    icon: "fa-solid fa-layer-group",
    href: "/spiora",
    children: SPIORA_NAV_CHILDREN,
  };
}

const NAV_AI: NavItem = {
  href: "/ai-workspace",
  label: "AI Workspace",
  icon: "fa-solid fa-wand-magic-sparkles",
};

const NAV_KB: NavItem = {
  href: "/knowledge-base",
  label: "Knowledge Base",
  icon: "fa-solid fa-book",
};

const NAV_TASKS: NavItem = {
  href: "/tasks",
  label: "Задачи",
  icon: "fa-solid fa-list-check",
};

const NAV_CALENDAR: NavItem = {
  href: "/calendar",
  label: "Календарь",
  icon: "fa-solid fa-calendar-days",
};

const NAV_TEAM_CHAT: NavItem = {
  href: "/team-chat",
  label: "Командный чат",
  icon: "fa-solid fa-comments",
};

const NAV_MEETING_RECORDINGS: NavItem = {
  href: "/meeting-recordings",
  label: "Записи встреч",
  icon: "fa-solid fa-video",
};

const NAV_RELOCATION: NavItem = {
  href: "/relocation",
  label: "Эмиграция",
  icon: "fa-solid fa-plane-departure",
};

const NAV_CHECKUPS_EREVAN: NavItem = {
  href: "/checkups-erevan",
  label: "Чекапы в Ереване",
  icon: "fa-solid fa-stethoscope",
};

const NAV_ANALYTICS: NavItem = {
  href: "/analytics",
  label: "Analytics",
  icon: "fa-solid fa-chart-pie",
};

const NAV_TEAM: NavItem = {
  href: "/team",
  label: "Team",
  icon: "fa-solid fa-people-group",
};

const NAV_SETTINGS: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: "fa-solid fa-gear",
};

const NAV_WEBSITE: NavItem = {
  href: MARKETING_SITE_URL,
  label: "Сайт Sharp & Spice",
  icon: "fa-solid fa-globe",
  external: true,
};

/** Emigrant product sections grouped in the sidebar (shared). */
export const EMIGRANT_NAV_CHILDREN: NavItem[] = [
  NAV_CLIENTS,
  NAV_CRM_LEADS,
  NAV_NEW_FORMGRID_CLIENTS,
  NAV_CLIENT_INVITATIONS,
  NAV_CLIENT_INTAKE,
  NAV_FINANCE,
  NAV_AI,
  NAV_KB,
  NAV_RELOCATION,
];

export function getEmigrantNavChildren(role: UserRole): NavItem[] {
  if (role === "owner") {
    return [...EMIGRANT_NAV_CHILDREN, NAV_ANALYTICS];
  }
  return EMIGRANT_NAV_CHILDREN;
}

function buildEmigrantNav(role: UserRole): NavGroup {
  return {
    id: "emigrant",
    label: "Emigrant",
    icon: "fa-solid fa-passport",
    href: "/emigrant",
    children: getEmigrantNavChildren(role),
  };
}

const MANAGER_NAV: NavEntry[] = [
  NAV_DASHBOARD,
  buildEmigrantNav("manager"),
  buildSpioraNav(),
  NAV_CHECKUPS_EREVAN,
  NAV_TASKS,
  NAV_CALENDAR,
  NAV_MEETING_RECORDINGS,
  NAV_TEAM_CHAT,
  NAV_TEAM,
  NAV_WEBSITE,
];

const OWNER_NAV: NavEntry[] = [
  NAV_DASHBOARD,
  buildEmigrantNav("owner"),
  buildSpioraNav(),
  NAV_CHECKUPS_EREVAN,
  NAV_TASKS,
  NAV_CALENDAR,
  NAV_MEETING_RECORDINGS,
  NAV_TEAM_CHAT,
  NAV_TEAM,
  NAV_SETTINGS,
  NAV_WEBSITE,
];

const OWNER_ONLY_PREFIXES = ["/analytics", "/settings"];

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry && Array.isArray(entry.children);
}

export function flattenNavItems(entries: NavEntry[]): NavItem[] {
  const items: NavItem[] = [];
  for (const entry of entries) {
    if (isNavGroup(entry)) {
      if (entry.href) {
        items.push({
          href: entry.href,
          label: entry.label,
          icon: entry.icon,
        });
      }
      items.push(...entry.children);
    } else {
      items.push(entry);
    }
  }
  return items;
}

export function getNavItemsForRole(role: UserRole): NavEntry[] {
  return role === "owner" ? OWNER_NAV : MANAGER_NAV;
}

export function canAccessPath(role: UserRole, pathname: string): boolean {
  if (role === "owner") {
    return true;
  }

  if (
    OWNER_ONLY_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return false;
  }

  const allowedPrefixes = flattenNavItems(MANAGER_NAV)
    .filter((item) => !item.external)
    .map((item) => item.href);

  return allowedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function getDefaultPathForUser(_user: SessionUser): string {
  return "/dashboard";
}
