import { getFormgridClientFields } from "@/lib/google-sheets/formgrid-lookup";

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
