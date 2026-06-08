"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const NotificationProvider = dynamic(
  () =>
    import("@/components/notifications/NotificationProvider").then(
      (mod) => mod.NotificationProvider,
    ),
  { ssr: false },
);

export function AppShellNotifications({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}
