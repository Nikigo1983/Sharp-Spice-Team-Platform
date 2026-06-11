import styles from "./OnlineIndicator.module.css";

type OnlineIndicatorProps = {
  online: boolean;
  title?: string;
};

export function OnlineIndicator({ online, title = "В сети" }: OnlineIndicatorProps) {
  if (!online) return null;

  return (
    <span
      className={styles.dot}
      title={title}
      aria-label={title}
      role="img"
    />
  );
}
