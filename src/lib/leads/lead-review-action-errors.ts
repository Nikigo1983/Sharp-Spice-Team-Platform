import type { LeadDuplicateMatch } from "@/lib/leads/lead-review-types";

export type LeadReviewActionErrorCode =
  | "duplicate_detected_crm"
  | "duplicate_detected_desk"
  | "duplicate_detected"
  | "test_lead_detected"
  | "phone_invalid"
  | "validation_error"
  | "append_failed";

export function resolveValidationErrorCode(errors: string[]): LeadReviewActionErrorCode {
  if (errors.includes("test_lead_detected")) return "test_lead_detected";
  if (errors.includes("phone_invalid")) return "phone_invalid";
  return "validation_error";
}

export function resolveDuplicateErrorCode(
  strongMatches: LeadDuplicateMatch[],
): LeadReviewActionErrorCode {
  const sources = new Set(strongMatches.map((match) => match.source));
  if (sources.has("crm")) return "duplicate_detected_crm";
  if (sources.has("desk")) return "duplicate_detected_desk";
  return "duplicate_detected";
}

export function formatLeadReviewActionUserMessage(
  code: string | undefined,
  fallbackError?: string,
): string {
  switch (code) {
    case "duplicate_detected_crm":
      return "Клиент не создан: найден надёжный дубликат в CRM. Проверьте совпадения в блоке «Проверка дублей».";
    case "duplicate_detected_desk":
      return "Клиент не создан: клиент уже есть в Emigrant Desk. Проверьте совпадение по case number или email.";
    case "duplicate_detected":
      return "Клиент не создан: найден надёжный дубликат. Проверьте совпадения в блоке «Проверка дублей».";
    case "test_lead_detected":
      return "Клиент не создан: это тестовый или служебный лид. Создание в CRM запрещено.";
    case "phone_invalid":
      return "Клиент не создан: телефон в анкете некорректен или отсутствует. Исправьте данные в Formgrid.";
    case "validation_error":
      return "Клиент не создан: не хватает обязательных данных в анкете (ФИО, паспорт или телефон).";
    case "append_failed":
      return "Не удалось записать строку в Google Sheets. Обратитесь к администратору платформы.";
    default:
      return fallbackError?.trim() || "Не удалось выполнить действие. Попробуйте ещё раз.";
  }
}
