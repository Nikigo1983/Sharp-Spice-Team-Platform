"use client";

import { useEffect, useState } from "react";
import { OnlineIndicator } from "@/components/presence/OnlineIndicator";
import { PRESENCE_POLL_INTERVAL_MS } from "@/lib/presence/constants";
import type { PresenceMap } from "@/lib/presence/types";
import { formatTeamChatDateTime, formatVoiceDuration } from "@/lib/team-chat/format";
import type { TeamChatMessage } from "@/lib/team-chat/types";
import { Card } from "@/components/ui/Card";
import styles from "./DashboardView.module.css";

type DashboardTeamMessagesProps = {
  messages: TeamChatMessage[];
};

export function DashboardTeamMessages({ messages }: DashboardTeamMessagesProps) {
  const [presence, setPresence] = useState<PresenceMap>({});

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

  return (
    <ul className={styles.chatList}>
      {messages.slice(0, 5).map((message) => (
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
                  ? "🖼 Изображение"
                  : message.message_text}
            </p>
          </Card>
        </li>
      ))}
      {messages.length === 0 ? (
        <li className={styles.chatEmpty}>
          <p>Пока нет сообщений.</p>
        </li>
      ) : null}
    </ul>
  );
}
