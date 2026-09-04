export type LocaleLabel = { en: string; ru: string };

export type QuestionType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "date"
  | "select"
  | "boolean"
  | "yes_no"
  | "file"
  | "information";

export type QuestionOption = {
  value: string;
  label: LocaleLabel;
};

export type FileAnswer = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type QuestionVisibleWhen = {
  questionId: string;
  equals: string | boolean;
};

export type QuestionDefinition = {
  id: string;
  type: QuestionType;
  order: number;
  label: LocaleLabel;
  required?: boolean;
  options?: QuestionOption[];
  placeholder?: LocaleLabel;
  /** Prefill from portal session email */
  derivedFrom?: "portal_email";
  readOnly?: boolean;
  /** Show only when another answer matches */
  visibleWhen?: QuestionVisibleWhen;
  /** Accept attribute for file inputs, e.g. ".pdf" or ".jpg,.jpeg,.png" */
  accept?: string;
  maxSizeMb?: number;
  /** Optional link inside label (consent / privacy) */
  linkHref?: string;
  linkLabel?: LocaleLabel;
  layout?: "full" | "half";
  /** Expected writing system for free-text answers */
  script?: "latin" | "cyrillic";
};

export type SectionDefinition = {
  id: string;
  order: number;
  title: LocaleLabel;
  description?: LocaleLabel;
  questions: QuestionDefinition[];
};

export type QuestionnaireSchema = {
  schemaVersion: 1;
  templateKey: string;
  title: LocaleLabel;
  description?: LocaleLabel;
  sections: SectionDefinition[];
};

export type QuestionnaireStatus = "draft" | "submitted";

export type QuestionnaireAnswers = Record<string, unknown>;

export type QuestionnaireRecord = {
  id: string;
  clientPortalUserId: string;
  invitationId: string | null;
  email: string;
  firstName: string;
  status: QuestionnaireStatus;
  answers: QuestionnaireAnswers;
  revision: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  /** Set when a staff member opens the case in intake */
  staffOpenedAt: string | null;
};

export function pickLabel(
  label: LocaleLabel,
  locale: "ru" | "en" = "ru",
): string {
  return locale === "en" ? label.en : label.ru;
}

export function isFileAnswer(value: unknown): value is FileAnswer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.id === "string" &&
    rec.id.length > 0 &&
    typeof rec.fileName === "string" &&
    rec.fileName.length > 0 &&
    typeof rec.mimeType === "string" &&
    typeof rec.sizeBytes === "number" &&
    Number.isFinite(rec.sizeBytes) &&
    rec.sizeBytes >= 0
  );
}

export function isQuestionVisible(
  question: QuestionDefinition,
  answers: QuestionnaireAnswers,
): boolean {
  if (!question.visibleWhen) return true;
  return answers[question.visibleWhen.questionId] === question.visibleWhen.equals;
}

const CYRILLIC_RE = /[\u0400-\u04FF]/;

/** True if value contains Cyrillic letters (used for Latin-only fields). */
export function containsCyrillic(value: unknown): boolean {
  return typeof value === "string" && CYRILLIC_RE.test(value);
}
