"use client";

import styles from "./TeamChatView.module.css";

type ChatImageMessageProps = {
  src: string;
};

export function ChatImageMessage({ src }: ChatImageMessageProps) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.imageLink}
      title="Открыть изображение"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Изображение в чате" className={styles.chatImage} />
    </a>
  );
}
