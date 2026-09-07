"use client";

import type { ReactNode } from "react";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { TeamChatDesktopAlerts } from "@/components/notifications/TeamChatDesktopAlerts";
import { MeetingDockBanner } from "@/components/meet/MeetingDockBanner";

export function AppShellNotifications({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <MeetingDockBanner />
      <TeamChatDesktopAlerts />
      {children}
    </NotificationProvider>
  );
}
