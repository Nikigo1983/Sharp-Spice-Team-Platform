"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OnlineIndicator } from "@/components/presence/OnlineIndicator";
import { PRESENCE_POLL_INTERVAL_MS } from "@/lib/presence/constants";
import type { TeamMember } from "@/lib/team/types";
import styles from "./TeamOnlineBar.module.css";

export function TeamOnlineBar() {
  const [onlineMembers, setOnlineMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOnline = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { members?: TeamMember[] };
      const online = (data.members ?? []).filter((member) => member.isOnline);
      setOnlineMembers(online);
    } catch {
      setOnlineMembers([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOnline();
    const interval = setInterval(() => {
      void fetchOnline(true);
    }, PRESENCE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchOnline]);

  if (loading) {
    return (
      <p className={styles.hint}>Проверяем, кто в сети…</p>
    );
  }

  if (onlineMembers.length === 0) {
    return (
      <p className={styles.hint}>
        Сейчас никого нет в сети.{" "}
        <Link href="/team" className={styles.link}>
          Team
        </Link>
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>В сети:</span>
      <ul className={styles.list}>
        {onlineMembers.map((member) => (
          <li key={member.id} className={styles.item}>
            <OnlineIndicator online />
            <span>{member.name}</span>
          </li>
        ))}
      </ul>
      <Link href="/team" className={styles.link}>
        Все в Team
      </Link>
    </div>
  );
}
