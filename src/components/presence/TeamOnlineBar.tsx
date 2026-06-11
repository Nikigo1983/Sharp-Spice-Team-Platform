"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OnlineIndicator } from "@/components/presence/OnlineIndicator";
import { Card } from "@/components/ui/Card";
import { PRESENCE_POLL_INTERVAL_MS } from "@/lib/presence/constants";
import type { TeamMember } from "@/lib/team/types";
import styles from "./TeamOnlineBar.module.css";

type TeamOnlineBarProps = {
  variant?: "default" | "prominent";
};

export function TeamOnlineBar({ variant = "default" }: TeamOnlineBarProps) {
  const [onlineMembers, setOnlineMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const prominent = variant === "prominent";

  const fetchOnline = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { members?: TeamMember[] };
      const online = (data.members ?? []).filter((member) => member.isOnline);
      online.sort((a, b) => a.name.localeCompare(b.name, "ru"));
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
      <p className={prominent ? styles.prominentHint : styles.hint}>
        Проверяем, кто сейчас в сети…
      </p>
    );
  }

  if (onlineMembers.length === 0) {
    return (
      <Card className={prominent ? styles.prominentCard : styles.emptyCard}>
        <p className={prominent ? styles.prominentEmpty : styles.hint}>
          <span className={styles.offlineDot} aria-hidden />
          Сейчас никого нет в сети.{" "}
          <Link href="/team" className={styles.link}>
            Открыть Team
          </Link>
        </p>
      </Card>
    );
  }

  const content = (
    <>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <span className={styles.liveDot} aria-hidden />
          <span className={styles.label}>
            {prominent ? "Сейчас в сети" : "В сети"}
          </span>
          <span className={styles.count}>{onlineMembers.length}</span>
        </div>
        <Link href="/team" className={styles.link}>
          Все в Team
        </Link>
      </div>

      <ul className={styles.list}>
        {onlineMembers.map((member) => (
          <li key={member.id}>
            <span className={styles.chip}>
              <OnlineIndicator online title={`${member.name} в сети`} />
              <span className={styles.chipName}>{member.name}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );

  if (prominent) {
    return <Card className={styles.prominentCard}>{content}</Card>;
  }

  return <div className={styles.wrap}>{content}</div>;
}
