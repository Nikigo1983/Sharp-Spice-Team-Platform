export type LocaleLabel = { en: string; ru: string };

export type QuestionType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "date"
  | "select"
  | "boolean"
  | "information";

export type QuestionOption = {
  value: string;
  label: LocaleLabel;
};

export type QuestionDefinition = {
  id: string;
  type: QuestionType;
  order: number;
  label: LocaleLabel;
  required?: boolean;
  options?: QuestionOption[];
  derivedFrom?: "portal_email";
  readOnly?: boolean;
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
};

export function pickLabel(
  label: LocaleLabel,
  locale: "ru" | "en" = "ru",
): string {
  return locale === "en" ? label.en : label.ru;
}
