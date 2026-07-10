import type { TeamChatMessage } from "@/lib/team-chat/types";
import { messageTypeLabel } from "@/lib/team-chat/message-preview";
import styles from "./TeamChatView.module.css";

type ChatReplyQuoteProps = {
  userName: string;
  messageType: TeamChatMessage["message_type"];
  preview: string;
  onClick?: () => void;
  compact?: boolean;
};

export function ChatReplyQuote({
  userName,
  messageType,
  preview,
  onClick,
  compact = false,
}: ChatReplyQuoteProps) {
  const content = (
    <>
      <span className={styles.replyQuoteAuthor}>{userName}</span>
      <span className={styles.replyQuoteType}>{messageTypeLabel(messageType)}</span>
      <span className={styles.replyQuoteText}>{preview}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={
          compact ? styles.replyQuoteBtnCompact : styles.replyQuoteBtn
        }
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={compact ? styles.replyQuoteCompact : styles.replyQuote}>
      {content}
    </div>
  );
}

export function messageHasReply(message: TeamChatMessage): boolean {
  return Boolean(
    message.reply_to_message_id &&
      message.reply_to_user_name &&
      message.reply_to_message_type &&
      message.reply_to_preview,
  );
}

export function ChatMessageReply({
  message,
  onJumpToParent,
}: {
  message: TeamChatMessage;
  onJumpToParent?: (messageId: string) => void;
}) {
  if (
    !message.reply_to_message_id ||
    !message.reply_to_user_name ||
    !message.reply_to_message_type ||
    !message.reply_to_preview
  ) {
    return null;
  }

  return (
    <ChatReplyQuote
      userName={message.reply_to_user_name}
      messageType={message.reply_to_message_type}
      preview={message.reply_to_preview}
      onClick={
        onJumpToParent
          ? () => onJumpToParent(message.reply_to_message_id!)
          : undefined
      }
    />
  );
}
