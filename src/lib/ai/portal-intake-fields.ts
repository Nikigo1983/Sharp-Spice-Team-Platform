/**
 * Pure field readers for Emigrant portal intake answers (no server-only deps).
 * Keeps «Латиница» / «Договор» mapping correct for AI Workspace.
 */
import { readLegacyIdentity } from "@/lib/client-portal/legacy-crm";
import { readStaffFields } from "@/lib/client-portal/staff-fields";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readSheetColumnFromAnswers(
  answers: Record<string, unknown>,
  ...labels: string[]
): string {
  const sheets = [answers.__legacySheet, answers.__formgridSheet];
  const wanted = labels.map((label) => label.trim().toLowerCase());
  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) continue;
    const obj = sheet as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (!wanted.includes(key.trim().toLowerCase())) continue;
      const v = clean(value);
      if (v) return v;
    }
  }
  return "";
}

export function answerLatinNameFromAnswers(
  answers: Record<string, unknown>,
): string {
  const identity = readLegacyIdentity(answers);
  if (identity?.fullNameLatin) return identity.fullNameLatin;
  return (
    clean(answers.full_name_latin) ||
    readSheetColumnFromAnswers(answers, "Латиница", "Latin")
  );
}

/** Real citizenship/nationality — never the «Латиница» FIO column. */
export function answerCitizenshipFromAnswers(
  answers: Record<string, unknown>,
): string {
  const latin = answerLatinNameFromAnswers(answers).toLowerCase();
  const candidates = [
    clean(answers.citizenship_latin),
    clean(answers.nationality_latin),
    readSheetColumnFromAnswers(
      answers,
      "Гражданство",
      "Citizenship",
      "Национальность",
    ),
  ];
  for (const value of candidates) {
    if (!value) continue;
    if (latin && value.toLowerCase() === latin) continue;
    return value;
  }
  return "";
}

/** Contract label from staff fields or legacy/Formgrid «Договор» column. */
export function answerContractFromAnswers(
  answers: Record<string, unknown>,
): string {
  const staff = readStaffFields(answers);
  return (
    clean(staff.contractNumber) ||
    clean(staff.contractAmount) ||
    readSheetColumnFromAnswers(answers, "Договор", "Contract") ||
    clean(staff.company)
  );
}
