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

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const navItems = getNavItemsForRole(role);
  const [teamChatUnread, setTeamChatUnread] = useState(0);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const activeGroupIds = useMemo(() => {
    const ids: string[] = [];
    for (const entry of navItems) {
      if (!isNavGroup(entry)) continue;
      if (
        (entry.href &&
          (pathname === entry.href || pathname.startsWith(`${entry.href}/`))) ||
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
    if (pathname === "/team-chat" || pathname.startsWith("/team-chat/")) {
      setTeamChatUnread(0);
      return;
    }

    let cancelled = false;

    async function fetchUnread() {
      try {
        const res = await fetch("/api/team-chat/unread");
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: number };
        if (!cancelled) {
          setTeamChatUnread(Math.max(0, data.unread ?? 0));
        }
      } catch {
        // ignore
      }
    }

    void fetchUnread();
    const timer = setInterval(() => {
      void fetchUnread();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);

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
        <span className={styles.navLabel}>
          {item.label}
          {item.href === "/team-chat" && teamChatUnread > 0 ? (
            <span className={styles.unreadBadge}> ({teamChatUnread})</span>
          ) : null}
        </span>
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
              const onHub =
                Boolean(entry.href) &&
                (pathname === entry.href ||
                  pathname.startsWith(`${entry.href}/`));
              const childActive = groupHasActiveChild(
                pathname,
                entry.children,
              );

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
