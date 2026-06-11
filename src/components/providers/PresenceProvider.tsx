"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/presence/constants";

async function sendPresenceHeartbeat(): Promise<void> {
  try {
    await fetch("/api/presence/heartbeat", { method: "POST" });
  } catch {
    // Сеть недоступна — не ломаем UI.
  }
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const heartbeat = useCallback(() => {
    void sendPresenceHeartbeat();
  }, []);

  useEffect(() => {
    heartbeat();

    const interval = setInterval(heartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        heartbeat();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [heartbeat]);

  return children;
}
