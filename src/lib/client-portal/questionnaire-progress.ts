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

export function calculateProgress(answers: QuestionnaireAnswers): number {
  const required = allQuestions().filter(
    (question) =>
      question.required &&
      question.type !== "information" &&
      isQuestionVisible(question, answers),
  );
  if (required.length === 0) return 100;
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
