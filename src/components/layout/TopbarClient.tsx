"use client";

import { usePathname, useRouter } from "next/navigation";
import { signOutAction } from "@/app/login/actions";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import styles from "./Topbar.module.css";

export type TopbarClientProps = {
  sectionTitle: string;
  userName?: string;
  userRole?: string;
  searchPlaceholder?: string;
  defaultSearchValue?: string;
  onSearchChange?: (value: string) => void;
};

export function TopbarClient({
  sectionTitle,
  userName = "Пользователь",
  userRole = "Команда",
  searchPlaceholder = "Поиск…",
  defaultSearchValue,
  onSearchChange,
}: TopbarClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  function handleBack() {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      router.back();
      return;
    }
    if (pathname !== "/dashboard") {
      router.push("/dashboard");
    }
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.leading}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={handleBack}
          title="Вернуться назад"
          aria-label="Вернуться назад"
        >
          <i className="fa-solid fa-arrow-left" aria-hidden />
          <span className={styles.backLabel}>Вернуться назад</span>
        </button>
        <h2 className={styles.sectionTitle}>{sectionTitle}</h2>
      </div>

      <div className={styles.searchWrap}>
        <i
          className={`fa-solid fa-magnifying-glass ${styles.searchIcon}`}
          aria-hidden
        />
        <input
          type="search"
          className={styles.search}
          placeholder={searchPlaceholder}
          defaultValue={defaultSearchValue}
          onChange={
            onSearchChange
              ? (e) => onSearchChange(e.target.value)
              : undefined
          }
          aria-label="Поиск"
        />
      </div>

      <div className={styles.user}>
        <NotificationBell />
        <div className={styles.avatar} aria-hidden>
          <i className="fa-solid fa-user" />
        </div>
        <div className={styles.userMeta}>
          <span className={styles.userName}>{userName}</span>
          <span className={styles.userRole}>{userRole}</span>
        </div>
        <form action={signOutAction}>
          <button type="submit" className={styles.logout} title="Выйти">
            <i className="fa-solid fa-right-from-bracket" aria-hidden />
            <span className={styles.logoutLabel}>Выйти</span>
          </button>
        </form>
      </div>
    </header>
  );
}
