"use client";

import type { ReactNode } from "react";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { MeetingDockBanner } from "@/components/meet/MeetingDockBanner";

export function AppShellNotifications({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <MeetingDockBanner />
      {children}
    </NotificationProvider>
  );
}
