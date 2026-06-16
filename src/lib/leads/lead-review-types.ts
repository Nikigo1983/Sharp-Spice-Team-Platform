export const LEAD_REVIEW_STATUSES = [
  "new",
  "reviewed",
  "created_in_crm",
  "duplicate",
  "rejected",
] as const;

export type LeadReviewStatus = (typeof LEAD_REVIEW_STATUSES)[number];

export const LEAD_REVIEW_STATUS_LABELS: Record<LeadReviewStatus, string> = {
  new: "Новый",
  reviewed: "Проверен",
  created_in_crm: "Создан в CRM",
  duplicate: "Дубликат",
  rejected: "Отклонён",
};

export type LeadReviewRecord = {
  rowKey: string;
  sheetRow: number;
  status: LeadReviewStatus;
  updatedAt: string;
  updatedBy?: string;
  note?: string;
  /** Placeholder until Sheets write-path is implemented. */
  pendingCrmClientId?: string;
  crmWritePreview?: {
    mode: "status_only" | "dry_run" | "write_blocked" | "write";
    targetRange?: string;
    rowValues?: string[];
    validationErrors?: string[];
    duplicateReasons?: string[];
  };
};

export type LeadReviewStore = {
  reviews: Record<string, LeadReviewRecord>;
};

export type DuplicateMatchType = "strong" | "medium" | "possible";

export type LeadDuplicateMatch = {
  matchType: DuplicateMatchType;
  source: "crm" | "formgrid" | "desk";
  name: string;
  sheetRow?: number;
  clientId?: string;
  reasons: string[];
  possibleReasons?: string[];
};

export type LeadDedupAnalysis = {
  /** CRM and Formgrid strong matches that block create_in_crm. */
  blockingStrongMatches: LeadDuplicateMatch[];
  /** Emigrant Desk strong matches — informational only. */
  deskStrongMatches: LeadDuplicateMatch[];
  /** Emigrant Desk medium matches (name) — informational only. */
  deskMediumMatches: LeadDuplicateMatch[];
  possibleMatches: LeadDuplicateMatch[];
  hasBlockingStrongMatch: boolean;
  hasDeskHint: boolean;
  hasPossibleMatch: boolean;
};

export type LeadQueueItem = {
  id: string;
  sheetRow: number;
  rowKey: string;
  name: string;
  passport: string;
  phone: string;
  email: string;
  submittedAt: string;
  source: "Formgrid";
  reviewStatus: LeadReviewStatus;
  reviewStatusLabel: string;
  hasStrongDuplicate: boolean;
  hasPossibleDuplicate: boolean;
  updatedAt?: string;
};

export type LeadDetail = LeadQueueItem & {
  surveyFields: Array<{ label: string; value: string }>;
  dedup: LeadDedupAnalysis;
  review?: LeadReviewRecord;
};

export type LeadReviewAction =
  | "mark_reviewed"
  | "mark_duplicate"
  | "reject"
  | "create_in_crm";
