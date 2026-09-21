"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { ROLE_LABELS, type SessionUser } from "@/lib/auth/types";
import { AppShellNotifications } from "./AppShellNotifications";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import styles from "./AppShell.module.css";

export type StaffChromeOptions = {
  sectionTitle?: string;
  contentClassName?: string;
  searchPlaceholder?: string;
  defaultSearchValue?: string;
};

type StaffChromeContextValue = {
  setOptions: (next: StaffChromeOptions) => void;
};

const StaffChromeContext = createContext<StaffChromeContextValue | null>(null);

function titleFromPath(pathname: string): string {
  if (pathname.startsWith("/clients")) return "Клиенты";
  if (pathname.startsWith("/client-invitations")) return "Приглашения";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/emigrant")) return "Emigrant";
  if (pathname.startsWith("/spiora")) return "Spiora";
  if (pathname.startsWith("/checkups-erevan")) return "Чекапы в Ереване";
  if (pathname.startsWith("/tasks")) return "Задачи";
  if (pathname.startsWith("/calendar")) return "Календарь";
  if (pathname.startsWith("/meeting-recordings")) return "Записи встреч";
  if (pathname.startsWith("/team-chat")) return "Командный чат";
  if (pathname.startsWith("/team")) return "Team";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/finance")) return "Финансы";
  if (pathname.startsWith("/analytics")) return "Analytics";
  if (pathname.startsWith("/ai-workspace")) return "AI Workspace";
  if (pathname.startsWith("/knowledge-base")) return "Knowledge Base";
  if (pathname.startsWith("/crm")) return "CRM";
  if (pathname.startsWith("/new-formgrid-clients")) return "Новые клиенты";
  if (pathname.startsWith("/relocation")) return "Эмиграция";
  return "Sharp & Spice";
}

export function useStaffChromeSetter(): StaffChromeContextValue | null {
  return useContext(StaffChromeContext);
}

type StaffAppChromeProps = {
  user: SessionUser;
  children: ReactNode;
};

/** Persistent staff shell: left nav stays mounted across sections except video meets. */
export function StaffAppChrome({ user, children }: StaffAppChromeProps) {
  const pathname = usePathname() || "/";
  const [options, setOptions] = useState<StaffChromeOptions>({});
  const isVideoMeet = pathname.startsWith("/calendar/meet");

  const contextValue = useMemo(
    () => ({
      setOptions: (next: StaffChromeOptions) => {
        setOptions(next);
      },
    }),
    [],
  );

  if (isVideoMeet) {
    return <>{children}</>;
  }

  const sectionTitle = options.sectionTitle?.trim() || titleFromPath(pathname);

  return (
    <StaffChromeContext.Provider value={contextValue}>
      <div className={styles.shell}>
        <Sidebar role={user.role} />
        <AppShellNotifications>
          <div className={styles.main}>
            <Topbar
              sectionTitle={sectionTitle}
              userName={user.name}
              userRole={ROLE_LABELS[user.role]}
              searchPlaceholder={options.searchPlaceholder}
              defaultSearchValue={options.defaultSearchValue}
            />
            <main
              className={[styles.content, options.contentClassName]
                .filter(Boolean)
                .join(" ")}
            >
              {children}
            </main>
          </div>
        </AppShellNotifications>
      </div>
    </StaffChromeContext.Provider>
  );
}
