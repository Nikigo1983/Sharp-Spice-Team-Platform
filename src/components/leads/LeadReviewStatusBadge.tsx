import type { LeadReviewStatus } from "@/lib/leads/lead-review-types";
import { LEAD_REVIEW_STATUS_LABELS } from "@/lib/leads/lead-review-types";
import styles from "./LeadReviewQueue.module.css";

export function LeadReviewStatusBadge({
  status,
  label,
}: {
  status: LeadReviewStatus;
  label?: string;
}) {
  return (
    <span className={[styles.statusBadge, styles[`status_${status}`]].join(" ")}>
      {label ?? LEAD_REVIEW_STATUS_LABELS[status]}
    </span>
  );
}
