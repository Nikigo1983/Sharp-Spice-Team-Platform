import { linkifyText } from "@/lib/team-chat/linkify";
import styles from "./LeadReviewQueue.module.css";

const PURE_URL_PATTERN = /^https?:\/\/\S+$/i;

function linkLabel(href: string, fieldLabel?: string): string {
  if (fieldLabel?.trim()) {
    return `Открыть: ${fieldLabel.trim()}`;
  }
  if (/\.pdf(?:\?|$)/i.test(href)) {
    return "Открыть PDF";
  }
  return "Открыть документ";
}

type LeadFieldValueProps = {
  value: string;
  fieldLabel?: string;
};

export function LeadFieldValue({ value, fieldLabel }: LeadFieldValueProps) {
  const trimmed = value.trim();
  if (!trimmed) {
    return <>—</>;
  }

  if (PURE_URL_PATTERN.test(trimmed)) {
    return (
      <a
        href={trimmed}
        className={styles.fieldLink}
        target="_blank"
        rel="noopener noreferrer"
      >
        {linkLabel(trimmed, fieldLabel)}
      </a>
    );
  }

  const parts = linkifyText(trimmed);
  const hasLink = parts.some((part) => part.type === "link");
  if (!hasLink) {
    return <>{trimmed}</>;
  }

  return (
    <>
      {parts.map((part, index) =>
        part.type === "link" ? (
          <a
            key={`${part.href}-${index}`}
            href={part.href}
            className={styles.fieldLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part.label}
          </a>
        ) : (
          <span key={`text-${index}`}>{part.value}</span>
        ),
      )}
    </>
  );
}
