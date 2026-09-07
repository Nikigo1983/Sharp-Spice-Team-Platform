import { SPIORA_ONBOARDING_FIELDS, type OnboardingField } from "./schema";
import type { OnboardingAnswers } from "./types";

export type ValidationResult =
  | { ok: true }
  | { ok: false; field: string; message: string };

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export function validateOnboardingPayload(answers: OnboardingAnswers): ValidationResult {
  for (const field of SPIORA_ONBOARDING_FIELDS) {
    if (!field.required) continue;
    const value = answers[field.id];

    if (field.type === "multi") {
      if (asStringArray(value).length === 0) {
        return {
          ok: false,
          field: field.id,
          message: `Заполните: ${field.label}`,
        };
      }
      continue;
    }

    if (field.type === "yes_no") {
      if (value !== "yes" && value !== "no") {
        return {
          ok: false,
          field: field.id,
          message: `Ответьте: ${field.label}`,
        };
      }
      continue;
    }

    if (typeof value !== "string" || !value.trim()) {
      return {
        ok: false,
        field: field.id,
        message: `Заполните: ${field.label}`,
      };
    }

    if (field.allowOther && value === "other") {
      const other = String(answers[`${field.id}_other`] ?? "").trim();
      if (!other) {
        return {
          ok: false,
          field: `${field.id}_other`,
          message: `Уточните «Другое» для: ${field.label}`,
        };
      }
    }
  }

  for (const field of SPIORA_ONBOARDING_FIELDS) {
    if (field.type !== "multi" || !field.allowOther) continue;
    const selected = asStringArray(answers[field.id]);
    if (selected.includes("other")) {
      const other = String(answers[`${field.id}_other`] ?? "").trim();
      if (!other) {
        return {
          ok: false,
          field: `${field.id}_other`,
          message: `Уточните «Другое» для: ${field.label}`,
        };
      }
    }
  }

  return { ok: true };
}

export function companyNameFromAnswers(answers: OnboardingAnswers): string {
  const brand = String(answers.company_brand ?? "").trim();
  const legal = String(answers.company_legal ?? "").trim();
  return brand || legal || "Без названия";
}

export function groupFieldsBySection(): {
  section: string;
  fields: OnboardingField[];
}[] {
  const groups: { section: string; fields: OnboardingField[] }[] = [];
  for (const field of SPIORA_ONBOARDING_FIELDS) {
    const last = groups[groups.length - 1];
    if (last && last.section === field.section) {
      last.fields.push(field);
    } else {
      groups.push({ section: field.section, fields: [field] });
    }
  }
  return groups;
}
