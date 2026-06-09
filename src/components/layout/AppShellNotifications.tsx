"use client";

import type { ReactNode } from "react";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";

export function AppShellNotifications({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}
