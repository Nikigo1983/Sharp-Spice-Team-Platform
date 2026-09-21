"use client";

import { useEffect, useMemo, useState } from "react";
import { OnlineIndicator } from "@/components/presence/OnlineIndicator";
import { PRESENCE_POLL_INTERVAL_MS } from "@/lib/presence/constants";
import type { PresenceMap } from "@/lib/presence/types";
import { formatTeamChatDateTime, formatVoiceDuration } from "@/lib/team-chat/format";
import { DASHBOARD_TEAM_CHAT_MAX_AGE_MS } from "@/lib/team-chat/dashboard";
import type { TeamChatMessage } from "@/lib/team-chat/types";
import { Card } from "@/components/ui/Card";
import styles from "./DashboardView.module.css";

type DashboardTeamMessagesProps = {
  messages: TeamChatMessage[];
};

function isWithinDashboardWindow(
  createdAt: string,
  nowMs: number,
): boolean {
  const ts = Date.parse(createdAt);
  return Number.isFinite(ts) && nowMs - ts <= DASHBOARD_TEAM_CHAT_MAX_AGE_MS;
}

export function DashboardTeamMessages({ messages }: DashboardTeamMessagesProps) {
  const [presence, setPresence] = useState<PresenceMap>({});
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    async function fetchPresence() {
      try {
        const res = await fetch("/api/presence");
        if (!res.ok) return;
        const data = (await res.json()) as { presence?: PresenceMap };
        setPresence(data.presence ?? {});
      } catch {
        // ignore
      }
    }

    void fetchPresence();
    const interval = setInterval(() => {
      void fetchPresence();
    }, PRESENCE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const visible = useMemo(
    () =>
      messages
        .filter((message) => isWithinDashboardWindow(message.created_at, nowMs))
        .slice(0, 5),
    [messages, nowMs],
  );

  return (
    <ul className={styles.chatList}>
      {visible.map((message) => (
        <li key={message.id} className={styles.chatItem}>
          <Card className={styles.chatCard}>
            <div className={styles.chatMetaRow}>
              <span className={styles.chatAuthor}>
                <span className={styles.chatAuthorRow}>
                  {message.user_name}
                  <OnlineIndicator
                    online={Boolean(presence[message.user_id]?.isOnline)}
                  />
                </span>
              </span>
              <span className={styles.chatTime}>
                {formatTeamChatDateTime(message.created_at)}
              </span>
            </div>
            <p className={styles.chatText}>
              {message.message_type === "voice"
                ? `🎤 Голосовое сообщение${
                    message.audio_duration_ms != null
                      ? ` · ${formatVoiceDuration(message.audio_duration_ms)}`
                      : ""
                  }`
                : message.message_type === "image"
                  ? message.message_text?.trim()
                    ? `🖼 ${message.message_text.trim()}`
                    : "🖼 Изображение"
                  : message.message_type === "file"
                    ? message.message_text?.trim()
                      ? `📎 ${message.message_text.trim()}`
                      : `📎 ${message.file_name ?? "Файл"}`
                    : message.message_text}
            </p>
          </Card>
        </li>
      ))}
      {visible.length === 0 ? (
        <li className={styles.chatEmpty}>
          <p>Нет новых сообщений за последние 6 часов.</p>
        </li>
      ) : null}
    </ul>
  );
}
