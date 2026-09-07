import {
  getQuestionById,
  Q12_NEVER_TRIED_ID,
  Q7_NO_PROBLEMS_ID,
  Q18_NO_ID,
  SPIORA_QUESTIONS,
  type SpioraQuestion,
} from "./schema";
import type {
  SpioraSurveyAnswers,
  SpioraSurveyContact,
} from "./types";

export type SpioraSurveyFormState = {
  anonymous: boolean;
  companyName: string;
  answers: SpioraSurveyAnswers;
  contactName: string;
  contactChannel: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export function isQuestionVisible(
  question: SpioraQuestion,
  answers: SpioraSurveyAnswers,
): boolean {
  if (question.id === "q8_top_problems") {
    const problems = asStringArray(answers.q7_problems);
    const meaningful = problems.filter((id) => id !== Q7_NO_PROBLEMS_ID);
    return meaningful.length > 0;
  }

  if (question.id === "q13_crm_issues") {
    return answers.q12_tried_crm !== Q12_NEVER_TRIED_ID;
  }

  if (question.id === "q18_contact_details") {
    const ok = answers.q18_contact_ok;
    return ok === "yes" || ok === "maybe";
  }

  return true;
}

export function getVisibleQuestions(
  answers: SpioraSurveyAnswers,
): SpioraQuestion[] {
  return SPIORA_QUESTIONS.filter((q) => isQuestionVisible(q, answers));
}

export function getQ8Options(answers: SpioraSurveyAnswers) {
  const q7 = getQuestionById("q7_problems");
  if (!q7?.options) return [];
  const selected = asStringArray(answers.q7_problems).filter(
    (id) => id !== Q7_NO_PROBLEMS_ID,
  );
  return q7.options.filter((o) => selected.includes(o.id));
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; field: string; message: string };

export function validateSurveyPayload(input: {
  anonymous: boolean;
  companyName?: string | null;
  answers: SpioraSurveyAnswers;
  contact?: SpioraSurveyContact | null;
}): ValidationResult {
  const { anonymous, answers } = input;
  const companyName = (input.companyName ?? "").trim();

  if (!anonymous && !companyName) {
    return {
      ok: false,
      field: "companyName",
      message: "Укажите наименование компании или выберите анонимный режим.",
    };
  }

  for (const question of getVisibleQuestions(answers)) {
    const value = answers[question.id];

    if (question.type === "contact") {
      const name = input.contact?.name?.trim() ?? "";
      const channel = input.contact?.channel?.trim() ?? "";
      if (question.required && (!name || !channel)) {
        return {
          ok: false,
          field: question.id,
          message: "Укажите имя и способ связи.",
        };
      }
      continue;
    }

    if (question.type === "single") {
      if (question.required && (typeof value !== "string" || !value)) {
        return {
          ok: false,
          field: question.id,
          message: `Ответьте на вопрос: ${question.title}`,
        };
      }
      if (typeof value === "string" && value === "other") {
        const other = String(answers[`${question.id}_other`] ?? "").trim();
        if (!other) {
          return {
            ok: false,
            field: `${question.id}_other`,
            message: "Уточните вариант «Другое».",
          };
        }
      }
      continue;
    }

    if (question.type === "multi") {
      const selected = asStringArray(value);
      if (question.required && selected.length === 0) {
        return {
          ok: false,
          field: question.id,
          message: `Выберите хотя бы один вариант: ${question.title}`,
        };
      }
      if (question.maxSelect && selected.length > question.maxSelect) {
        return {
          ok: false,
          field: question.id,
          message: `Можно выбрать не более ${question.maxSelect}.`,
        };
      }
      if (question.id === "q8_top_problems") {
        const allowed = new Set(getQ8Options(answers).map((o) => o.id));
        if (selected.some((id) => !allowed.has(id))) {
          return {
            ok: false,
            field: question.id,
            message: "Выберите проблемы только из отмеченных в вопросе 7.",
          };
        }
      }
      if (selected.includes("other")) {
        const other = String(answers[`${question.id}_other`] ?? "").trim();
        if (!other) {
          return {
            ok: false,
            field: `${question.id}_other`,
            message: "Уточните вариант «Другое».",
          };
        }
      }
      continue;
    }

    if (question.type === "scale") {
      const n = typeof value === "number" ? value : Number(value);
      const min = question.scaleMin ?? 1;
      const max = question.scaleMax ?? 10;
      if (question.required && (!Number.isFinite(n) || n < min || n > max)) {
        return {
          ok: false,
          field: question.id,
          message: `Оцените по шкале ${min}–${max}.`,
        };
      }
      continue;
    }

    if (question.type === "text") {
      const text = typeof value === "string" ? value.trim() : "";
      if (question.required && !text) {
        return {
          ok: false,
          field: question.id,
          message: `Ответьте на вопрос: ${question.title}`,
        };
      }
    }
  }

  if (answers.q18_contact_ok === Q18_NO_ID) {
    // contact must not be required
  } else if (
    answers.q18_contact_ok === "yes" ||
    answers.q18_contact_ok === "maybe"
  ) {
    const name = input.contact?.name?.trim() ?? "";
    const channel = input.contact?.channel?.trim() ?? "";
    if (!name || !channel) {
      return {
        ok: false,
        field: "q18_contact_details",
        message: "Укажите имя и способ связи.",
      };
    }
  }

  return { ok: true };
}
