import {
  getQuestionById,
  optionLabel,
  SPIORA_QUESTIONS,
  type SpioraQuestion,
} from "./schema";
import type { SpioraSurveyResponse } from "./types";

export type SpioraAnswerDisplay = {
  questionId: string;
  number?: number;
  title: string;
  section?: string;
  value: string;
};

function formatMulti(
  question: SpioraQuestion,
  selected: string[],
  otherText: string,
): string {
  const labels = selected.map((id) => {
    if (id === "other") return otherText || "Другое";
    if (question.id === "q8_top_problems") {
      const q7 = getQuestionById("q7_problems");
      return q7 ? optionLabel(q7, id) : id;
    }
    return optionLabel(question, id);
  });
  return labels.join("; ");
}

export function formatResponseAnswers(
  response: SpioraSurveyResponse,
): SpioraAnswerDisplay[] {
  const rows: SpioraAnswerDisplay[] = [
    {
      questionId: "company",
      title: "Компания",
      section: "Вступление",
      value: response.anonymous
        ? "Анонимно"
        : response.companyName?.trim() || "—",
    },
  ];

  for (const question of SPIORA_QUESTIONS) {
    if (question.type === "contact") {
      if (!response.contact) continue;
      rows.push({
        questionId: question.id,
        number: question.number,
        title: question.title,
        section: question.section,
        value: `${response.contact.name} · ${response.contact.channel}`,
      });
      continue;
    }

    const raw = response.answers[question.id];
    if (raw === undefined || raw === null || raw === "") continue;

    if (question.type === "multi") {
      const selected = Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === "string")
        : [];
      if (selected.length === 0) continue;
      const other = String(response.answers[`${question.id}_other`] ?? "");
      rows.push({
        questionId: question.id,
        number: question.number,
        title: question.title,
        section: question.section,
        value: formatMulti(question, selected, other),
      });
      continue;
    }

    if (question.type === "single") {
      const id = String(raw);
      const label =
        id === "other"
          ? String(response.answers[`${question.id}_other`] ?? "Другое")
          : optionLabel(question, id);
      rows.push({
        questionId: question.id,
        number: question.number,
        title: question.title,
        section: question.section,
        value: label,
      });
      continue;
    }

    if (question.type === "scale") {
      rows.push({
        questionId: question.id,
        number: question.number,
        title: question.title,
        section: question.section,
        value: `${raw} / 10`,
      });
      continue;
    }

    rows.push({
      questionId: question.id,
      number: question.number,
      title: question.title,
      section: question.section,
      value: String(raw),
    });
  }

  return rows;
}
