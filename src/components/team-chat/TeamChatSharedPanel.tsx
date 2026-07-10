"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  TeamChatLinkItem,
  TeamChatMessage,
  TeamChatSharedMediaType,
} from "@/lib/team-chat/types";
import { formatTeamChatDateTime } from "@/lib/team-chat/format";
import { ChatFileMessage } from "./ChatFileMessage";
import { ChatImageMessage } from "./ChatImageMessage";
import { VoiceMessageAudio } from "./VoiceMessageAudio";
import styles from "./TeamChatView.module.css";

const TABS: Array<{ id: TeamChatSharedMediaType; label: string }> = [
  { id: "image", label: "Медиа" },
  { id: "file", label: "Файлы" },
  { id: "links", label: "Ссылки" },
  { id: "voice", label: "Голосовые" },
];

type TeamChatSharedPanelProps = {
  activeTab: TeamChatSharedMediaType;
  onTabChange: (tab: TeamChatSharedMediaType) => void;
  onOpenMessage: (messageId: string) => void;
};

export function TeamChatSharedPanel({
  activeTab,
  onTabChange,
  onOpenMessage,
}: TeamChatSharedPanelProps) {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [links, setLinks] = useState<TeamChatLinkItem[]>([]);

  const fetchShared = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/team-chat/media?type=${encodeURIComponent(activeTab)}&limit=80`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as
        | { type: "links"; links: TeamChatLinkItem[] }
        | { type: "image" | "file" | "voice"; messages: TeamChatMessage[] };

      if (data.type === "links") {
        setLinks(data.links);
        setMessages([]);
      } else {
        setMessages(data.messages);
        setLinks([]);
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    void fetchShared();
  }, [fetchShared]);

  return (
    <div className={styles.sharedPanel}>
      <div className={styles.sharedTabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={
              activeTab === tab.id
                ? styles.sharedTabActive
                : styles.sharedTab
            }
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.sharedEmpty}>Загрузка…</p>
      ) : activeTab === "links" ? (
        links.length ? (
          <div className={styles.sharedLinks}>
            {links.map((link, index) => (
              <div
                key={`${link.message_id}-${link.url}-${index}`}
                className={styles.sharedLinkItem}
              >
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.sharedLinkUrl}
                >
                  {link.url}
                </a>
                <div className={styles.sharedLinkMeta}>
                  <span>{link.user_name}</span>
                  <span>{formatTeamChatDateTime(link.created_at)}</span>
                </div>
                <button
                  type="button"
                  className={styles.sharedOpenMessageBtn}
                  onClick={() => onOpenMessage(link.message_id)}
                >
                  К сообщению
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.sharedEmpty}>Ссылок пока нет.</p>
        )
      ) : messages.length ? (
        <div
          className={
            activeTab === "image"
              ? styles.sharedMediaGrid
              : styles.sharedList
          }
        >
          {messages.map((message) => (
            <div key={message.id} className={styles.sharedItem}>
              {activeTab === "image" && message.image_url ? (
                <button
                  type="button"
                  className={styles.sharedImageBtn}
                  onClick={() => onOpenMessage(message.id)}
                >
                  <ChatImageMessage src={message.image_url} />
                </button>
              ) : null}
              {activeTab === "file" && message.file_url ? (
                <ChatFileMessage
                  src={message.file_url}
                  fileName={message.file_name ?? "Файл"}
                  fileSize={message.file_size}
                  contentType={message.file_content_type}
                />
              ) : null}
              {activeTab === "voice" && message.audio_url ? (
                <VoiceMessageAudio
                  src={message.audio_url}
                  durationMs={message.audio_duration_ms}
                />
              ) : null}
              <div className={styles.sharedItemMeta}>
                <span>{message.user_name}</span>
                <span>{formatTeamChatDateTime(message.created_at)}</span>
              </div>
              <button
                type="button"
                className={styles.sharedOpenMessageBtn}
                onClick={() => onOpenMessage(message.id)}
              >
                К сообщению
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.sharedEmpty}>В этой категории пока пусто.</p>
      )}
    </div>
  );
}
