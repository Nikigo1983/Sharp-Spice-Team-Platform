import type { NavItem } from "@/components/layout/Sidebar";
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

const NAV_NEW_FORMGRID_CLIENTS: NavItem = {
  href: "/new-formgrid-clients",
  label: "Новые клиенты из анкеты",
  icon: "fa-solid fa-user-plus",
};

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

const NAV_TEAM_CHAT: NavItem = {
  href: "/team-chat",
  label: "Командный чат",
  icon: "fa-solid fa-comments",
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

const MANAGER_NAV: NavItem[] = [
  NAV_DASHBOARD,
  NAV_CLIENTS,
  NAV_NEW_FORMGRID_CLIENTS,
  NAV_AI,
  NAV_KB,
  NAV_TASKS,
  NAV_TEAM_CHAT,
  NAV_RELOCATION,
  NAV_CHECKUPS_EREVAN,
  NAV_TEAM,
  NAV_WEBSITE,
];

const OWNER_NAV: NavItem[] = [
  NAV_DASHBOARD,
  NAV_CLIENTS,
  NAV_NEW_FORMGRID_CLIENTS,
  NAV_AI,
  NAV_KB,
  NAV_TASKS,
  NAV_TEAM_CHAT,
  NAV_RELOCATION,
  NAV_CHECKUPS_EREVAN,
  NAV_ANALYTICS,
  NAV_TEAM,
  NAV_SETTINGS,
  NAV_WEBSITE,
];

const OWNER_ONLY_PREFIXES = ["/analytics", "/settings"];

export function getNavItemsForRole(role: UserRole): NavItem[] {
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

  const allowedPrefixes = MANAGER_NAV.filter((item) => !item.external).map(
    (item) => item.href,
  );
  return allowedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function getDefaultPathForUser(_user: SessionUser): string {
  return "/dashboard";
}
