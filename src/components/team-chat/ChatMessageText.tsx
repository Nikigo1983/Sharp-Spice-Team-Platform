import { linkifyText } from "@/lib/team-chat/linkify";
import styles from "./ChatMessageText.module.css";

type ChatMessageTextProps = {
  text: string;
  className?: string;
};

export function ChatMessageText({ text, className }: ChatMessageTextProps) {
  const parts = linkifyText(text);

  return (
    <p className={[styles.text, className].filter(Boolean).join(" ")}>
      {parts.map((part, index) =>
        part.type === "link" ? (
          <a
            key={`${part.href}-${index}`}
            href={part.href}
            className={styles.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part.label}
          </a>
        ) : (
          <span key={`text-${index}`}>{part.value}</span>
        ),
      )}
    </p>
  );
}
