import { SHARP_SPICE_ONBOARDING_SCHEMA } from "./questionnaire-schema";
import type {
  QuestionnaireAnswers,
  QuestionDefinition,
} from "./questionnaire-types";
import {
  isFileAnswer,
  isQuestionVisible,
  pickLabel,
} from "./questionnaire-types";

function allQuestions(): QuestionDefinition[] {
  return SHARP_SPICE_ONBOARDING_SCHEMA.sections.flatMap(
    (section) => section.questions,
  );
}

function countsTowardProgress(question: QuestionDefinition): boolean {
  if (!question.required) return false;
  if (question.type === "information") return false;
  if (question.derivedFrom) return false;
  if (question.readOnly) return false;
  return true;
}

export function isAnswerFilled(
  question: QuestionDefinition,
  value: unknown,
): boolean {
  if (question.type === "information") return true;
  if (question.type === "boolean") return value === true;
  if (question.type === "yes_no") return value === "yes" || value === "no";
  if (question.type === "file") return isFileAnswer(value);
  return value !== undefined && value !== null && String(value).trim() !== "";
}

/** True when draft has uploads/flags but no typed answers (leftover after wipe). */
export function isOrphanedDraftAnswers(answers: QuestionnaireAnswers): boolean {
  let hasTypedAnswer = false;
  let hasOtherProgress = false;
  for (const question of allQuestions()) {
    if (question.type === "information" || question.derivedFrom) continue;
    if (!isAnswerFilled(question, answers[question.id])) continue;
    if (
      question.type === "text" ||
      question.type === "textarea" ||
      question.type === "phone" ||
      question.type === "date" ||
      question.type === "email" ||
      question.type === "select"
    ) {
      hasTypedAnswer = true;
    } else {
      hasOtherProgress = true;
    }
  }
  return hasOtherProgress && !hasTypedAnswer;
}

export function calculateProgress(answers: QuestionnaireAnswers): number {
  const required = allQuestions().filter(
    (question) =>
      countsTowardProgress(question) && isQuestionVisible(question, answers),
  );
  if (required.length === 0) return 0;
  let done = 0;
  for (const question of required) {
    if (isAnswerFilled(question, answers[question.id])) done += 1;
  }
  return Math.round((done / required.length) * 100);
}

export function validateRequiredAnswers(
  answers: QuestionnaireAnswers,
  locale: "ru" | "en" = "ru",
): string[] {
  const errors: string[] = [];
  for (const question of allQuestions()) {
    if (question.type === "information" || !question.required) continue;
    if (!isQuestionVisible(question, answers)) continue;
    if (!isAnswerFilled(question, answers[question.id])) {
      errors.push(pickLabel(question.label, locale));
    }
  }

  const email = String(answers.contact_email ?? "").trim().toLowerCase();
  if (email && !email.endsWith(".com")) {
    errors.push(
      locale === "ru"
        ? "Электронный адрес должен быть в домене .com"
        : "Email must use a .com domain",
    );
  }

  return errors;
}
