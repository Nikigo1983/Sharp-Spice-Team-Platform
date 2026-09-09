"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import {
  getNavItemsForRole,
  isNavGroup,
} from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/types";
import {
  isNavBadgeHref,
  pathnameToNavBadgeHref,
  type NavBadgesMap,
} from "@/lib/nav-badges/types";
import styles from "./Sidebar.module.css";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Внешняя ссылка (открывается в новой вкладке) */
  external?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: string;
  /** Hub page for the group */
  href?: string;
  children: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

function isActive(
  pathname: string,
  href: string,
  siblingHrefs: string[] = [],
) {
  if (href === "/dashboard") {
    return pathname === href;
  }
  const matches = pathname === href || pathname.startsWith(`${href}/`);
  if (!matches) return false;
  // Prefer the more specific sibling (e.g. /clients/intake over /clients).
  return !siblingHrefs.some(
    (other) =>
      other !== href &&
      other.length > href.length &&
      (other === href || other.startsWith(`${href}/`)) &&
      (pathname === other || pathname.startsWith(`${other}/`)),
  );
}

function groupHasActiveChild(pathname: string, children: NavItem[]) {
  const hrefs = children.map((child) => child.href);
  return children.some((child) => isActive(pathname, child.href, hrefs));
}

function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const navItems = getNavItemsForRole(role);
  const [badges, setBadges] = useState<NavBadgesMap>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const activeGroupIds = useMemo(() => {
    const ids: string[] = [];
    for (const entry of navItems) {
      if (!isNavGroup(entry)) continue;
      if (
        (entry.href && pathname === entry.href) ||
        groupHasActiveChild(pathname, entry.children)
      ) {
        ids.push(entry.id);
      }
    }
    return ids;
  }, [navItems, pathname]);

  useEffect(() => {
    if (activeGroupIds.length === 0) return;
    setOpenGroups((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of activeGroupIds) {
        if (!next[id]) {
          next[id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeGroupIds]);

  useEffect(() => {
    const activeHref = pathnameToNavBadgeHref(pathname);
    let cancelled = false;

    async function fetchBadges() {
      try {
        const res = await fetch("/api/nav-badges", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { badges?: NavBadgesMap };
        if (cancelled) return;
        const next = { ...(data.badges ?? {}) };
        if (activeHref) delete next[activeHref];
        setBadges(next);
      } catch {
        // ignore
      }
    }

    async function markSeenAndRefresh() {
      if (activeHref && isNavBadgeHref(activeHref)) {
        try {
          await fetch("/api/nav-badges/seen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ href: activeHref }),
          });
        } catch {
          // ignore
        }
      }
      await fetchBadges();
    }

    void markSeenAndRefresh();
    const timer = setInterval(() => {
      void fetchBadges();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);

  function badgeForHref(href: string): number {
    if (!isNavBadgeHref(href)) return 0;
    if (pathnameToNavBadgeHref(pathname) === href) return 0;
    return Math.max(0, badges[href] ?? 0);
  }

  function groupBadgeCount(children: NavItem[]): number {
    return children.reduce((sum, child) => sum + badgeForHref(child.href), 0);
  }

  function renderBadge(count: number) {
    if (count <= 0) return null;
    return (
      <span className={styles.unreadBadge} aria-label={`${count} новых`}>
        {formatBadgeCount(count)}
      </span>
    );
  }

  function renderNavLink(
    item: NavItem,
    siblingHrefs: string[],
    nested = false,
  ) {
    const active = !item.external && isActive(pathname, item.href, siblingHrefs);
    const className = [
      styles.navLink,
      nested ? styles.navLinkNested : "",
      item.external ? styles.navLinkExternal : "",
      active ? styles.active : "",
    ]
      .filter(Boolean)
      .join(" ");

    const content = (
      <>
        <i className={[item.icon, styles.icon].join(" ")} aria-hidden />
        <span className={styles.navLabel}>{item.label}</span>
        {renderBadge(badgeForHref(item.href))}
        {item.external ? (
          <i
            className={`fa-solid fa-arrow-up-right-from-square ${styles.externalIcon}`}
            aria-hidden
          />
        ) : null}
      </>
    );

    if (item.external) {
      return (
        <a
          href={item.href}
          className={className}
          target="_blank"
          rel="noopener noreferrer"
        >
          {content}
        </a>
      );
    }

    return (
      <Link
        href={item.href}
        className={className}
        aria-current={active ? "page" : undefined}
      >
        {content}
      </Link>
    );
  }

  return (
    <aside className={styles.sidebar}>
      <Logo
        href="/dashboard"
        size="sidebar"
        priority
        className={styles.brand}
      />

      <nav className={styles.nav} aria-label="Основная навигация">
        <ul className={styles.navList}>
          {navItems.map((entry) => {
            if (isNavGroup(entry)) {
              const childHrefs = entry.children.map((child) => child.href);
              const open =
                openGroups[entry.id] ?? activeGroupIds.includes(entry.id);
              const onHub = Boolean(entry.href) && pathname === entry.href;
              const childActive = groupHasActiveChild(
                pathname,
                entry.children,
              );
              const groupCount = open ? 0 : groupBadgeCount(entry.children);

              return (
                <li key={entry.id} className={styles.navGroup}>
                  <div className={styles.groupRow}>
                    {entry.href ? (
                      <Link
                        href={entry.href}
                        className={[
                          styles.navLink,
                          styles.groupLink,
                          onHub ? styles.active : "",
                          !onHub && childActive ? styles.groupLinkActive : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-current={
                          pathname === entry.href ? "page" : undefined
                        }
                      >
                        <i
                          className={[entry.icon, styles.icon].join(" ")}
                          aria-hidden
                        />
                        <span className={styles.navLabel}>{entry.label}</span>
                        {renderBadge(groupCount)}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={[
                          styles.navLink,
                          styles.groupLink,
                          childActive ? styles.groupLinkActive : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() =>
                          setOpenGroups((prev) => ({
                            ...prev,
                            [entry.id]: !open,
                          }))
                        }
                      >
                        <i
                          className={[entry.icon, styles.icon].join(" ")}
                          aria-hidden
                        />
                        <span className={styles.navLabel}>{entry.label}</span>
                        {renderBadge(groupCount)}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.groupToggle}
                      aria-expanded={open}
                      aria-label={
                        open
                          ? `Свернуть раздел ${entry.label}`
                          : `Развернуть раздел ${entry.label}`
                      }
                      onClick={() =>
                        setOpenGroups((prev) => ({
                          ...prev,
                          [entry.id]: !open,
                        }))
                      }
                    >
                      <i
                        className={`fa-solid fa-chevron-${open ? "up" : "down"}`}
                        aria-hidden
                      />
                    </button>
                  </div>
                  {open ? (
                    <ul className={styles.subList}>
                      {entry.children.map((child) => (
                        <li key={child.href}>
                          {renderNavLink(child, childHrefs, true)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            }

            return (
              <li
                key={entry.href}
                className={entry.external ? styles.navItemExternal : undefined}
              >
                {renderNavLink(entry, [])}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
