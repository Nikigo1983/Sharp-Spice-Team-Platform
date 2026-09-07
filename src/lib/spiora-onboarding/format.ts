import { optionLabel, SPIORA_ONBOARDING_FIELDS } from "./schema";
import type { SpioraOnboardingResponse } from "./types";

export type OnboardingAnswerDisplay = {
  fieldId: string;
  section: string;
  label: string;
  value: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export function formatOnboardingAnswers(
  response: SpioraOnboardingResponse,
): OnboardingAnswerDisplay[] {
  const rows: OnboardingAnswerDisplay[] = [];

  for (const field of SPIORA_ONBOARDING_FIELDS) {
    const raw = response.answers[field.id];
    if (raw === undefined || raw === null || raw === "") continue;

    let value = "";
    if (field.type === "multi") {
      const selected = asStringArray(raw);
      if (selected.length === 0) continue;
      value = selected
        .map((id) => {
          if (id === "other") {
            return String(response.answers[`${field.id}_other`] ?? "Другое");
          }
          return optionLabel(field, id);
        })
        .join("; ");
    } else if (field.type === "single" || field.type === "yes_no") {
      const id = String(raw);
      if (id === "other") {
        value = String(response.answers[`${field.id}_other`] ?? "Другое");
      } else if (field.type === "yes_no") {
        value = id === "yes" ? "Да" : id === "no" ? "Нет" : id;
      } else {
        value = optionLabel(field, id);
      }
    } else {
      value = String(raw);
    }

    if (!value.trim()) continue;
    rows.push({
      fieldId: field.id,
      section: field.section,
      label: field.label,
      value,
    });
  }

  return rows;
}
