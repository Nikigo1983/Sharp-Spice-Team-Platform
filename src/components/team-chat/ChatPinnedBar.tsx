import type { TeamChatMessage } from "@/lib/team-chat/types";
import { buildMessagePreview } from "@/lib/team-chat/message-preview";
import { UiIcon } from "@/components/ui/UiIcon";
import styles from "./TeamChatView.module.css";

type ChatPinnedBarProps = {
  messages: TeamChatMessage[];
  onSelect: (messageId: string) => void;
  onUnpin: (message: TeamChatMessage) => void;
};

export function ChatPinnedBar({
  messages,
  onSelect,
  onUnpin,
}: ChatPinnedBarProps) {
  if (!messages.length) return null;

  return (
    <div className={styles.pinnedBar}>
      <div className={styles.pinnedBarHeader}>
        <UiIcon icon="thumbtack" className={styles.pinnedBarIcon} />
        <span>Закреплённые</span>
      </div>
      <div className={styles.pinnedList}>
        {messages.map((message) => (
          <div key={message.id} className={styles.pinnedItem}>
            <button
              type="button"
              className={styles.pinnedItemBtn}
              onClick={() => onSelect(message.id)}
            >
              <span className={styles.pinnedItemAuthor}>{message.user_name}</span>
              <span className={styles.pinnedItemPreview}>
                {buildMessagePreview(message)}
              </span>
            </button>
            <button
              type="button"
              className={styles.pinnedUnpinBtn}
              aria-label="Открепить"
              onClick={() => onUnpin(message)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
