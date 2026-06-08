"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { getNavItemsForRole } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/types";
import styles from "./Sidebar.module.css";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Внешняя ссылка (открывается в новой вкладке) */
  external?: boolean;
};

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const navItems = getNavItemsForRole(role);
  const [teamChatUnread, setTeamChatUnread] = useState(0);

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

  return (
    <aside className={styles.sidebar}>
      <Logo
        href="/dashboard"
        size="lg"
        priority
        className={styles.brand}
      />

      <nav className={styles.nav} aria-label="Основная навигация">
        <ul className={styles.navList}>
          {navItems.map((item) => {
            const active = !item.external && isActive(pathname, item.href);
            const className = [
              styles.navLink,
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

            return (
              <li
                key={item.href}
                className={item.external ? styles.navItemExternal : undefined}
              >
                {item.external ? (
                  <a
                    href={item.href}
                    className={className}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {content}
                  </a>
                ) : (
                  <Link
                    href={item.href}
                    className={className}
                    aria-current={active ? "page" : undefined}
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
