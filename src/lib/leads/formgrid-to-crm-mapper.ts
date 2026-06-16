import { getFormgridClientFields } from "@/lib/google-sheets/formgrid-lookup";

const TEST_NAME_PATTERN = /\b(test|тест|asdf?|qwe)\b/i;

function extractSurname(fullName: string): string {
  const tokens = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return tokens[0] ?? "";
}

function extractLatinName(headers: string[], row: string[]): string {
  const idx = headers.findIndex((header) =>
    /латин|latin/i.test(header),
  );
  return idx >= 0 ? (row[idx] ?? "").trim() : "";
}

function normalizePhoneForValidation(value: string): string {
  return value.replace(/\D/g, "");
}

export function validateLeadForCrmCreate(input: {
  name: string;
  passport: string;
  phone: string;
}): string[] {
  const errors: string[] = [];

  const name = input.name.trim();
  const nameWords = name.split(/\s+/).filter(Boolean);
  if (!name || nameWords.length < 2 || TEST_NAME_PATTERN.test(name)) {
    errors.push("name_invalid");
  }

  const passportNorm = input.passport
    .trim()
    .replace(/^[\s№#]*(?:no\.?|n\.?)\s*/i, "")
    .replace(/№/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  if (!passportNorm || passportNorm.length < 6) {
    errors.push("passport_invalid");
  }

  const phoneRaw = input.phone.trim();
  const phoneNorm = normalizePhoneForValidation(phoneRaw);
  if (!phoneRaw || /#error!/i.test(phoneRaw) || phoneNorm.length < 10) {
    errors.push("phone_invalid");
  }

  return errors;
}

export function buildExternalRowFromFormgridLead(params: {
  headers: string[];
  row: string[];
  sheetRow: number;
  updatedBy: string;
}): string[] {
  const { headers, row, sheetRow, updatedBy } = params;
  const fields = getFormgridClientFields(headers, row);
  const surname = extractSurname(fields.name);
  const latinName = extractLatinName(headers, row);
  const stamp = new Date().toISOString();
  const note = [
    `[Lead Review ${stamp}, row ${sheetRow}, ${updatedBy}]`,
    `ФИО: ${fields.name || "—"}`,
    `Телефон: ${fields.phone || "—"}`,
    `Email: ${fields.email || "—"}`,
    `Дата рождения: ${fields.birthDate || "—"}`,
  ].join("\n");

  return [
    surname, // A Фамилия
    latinName, // B ФИО латиницей
    fields.passport.trim(), // C Номер паспорта
    fields.submittedAt.trim(), // D Дата подачи
    "", // E
    "", // F
    "", // G
    "", // H
    "", // I
    note, // J Заметки
    "", // K
    "", // L
    "", // M
  ];
}
