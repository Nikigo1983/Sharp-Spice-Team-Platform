import {
  extractPersonNameTokens,
  namePartMatches,
  scoreNameInText,
} from "@/lib/ai/name-matching";
import {
  getFormgridClientName,
  getFormgridSubmissionDate,
} from "@/lib/google-sheets/formgrid-dates";
import { getFormgridLeadsTable, type LeadsTableResult } from "./formgrid-leads";

function findColumnIndex(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((header) =>
    patterns.some((pattern) => pattern.test(header)),
  );
}

export type FormgridClientFields = {
  name: string;
  email: string;
  phone: string;
  passport: string;
  birthDate: string;
  submittedAt: string;
};

export function getFormgridClientFields(
  headers: string[],
  row: string[],
): FormgridClientFields {
  const passportIdx = findColumnIndex(headers, [
    /заграничн.*паспорт/i,
    /№\s*загран/i,
    /passport/i,
  ]);
  const phoneIdx = findColumnIndex(headers, [/телефон|phone/i]);
  const emailIdx = findColumnIndex(headers, [/email|почта|e-mail|электронн/i]);
  const birthIdx = findColumnIndex(headers, [/дата рождения|birth/i]);

  const submitted = getFormgridSubmissionDate(headers, row);

  return {
    name: getFormgridClientName(headers, row),
    email: emailIdx >= 0 ? (row[emailIdx]?.trim() ?? "") : "",
    phone: phoneIdx >= 0 ? (row[phoneIdx]?.trim() ?? "") : "",
    passport: passportIdx >= 0 ? (row[passportIdx]?.trim() ?? "") : "",
    birthDate: birthIdx >= 0 ? (row[birthIdx]?.trim() ?? "") : "",
    submittedAt: submitted
      ? submitted.toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "",
  };
}

function countMatchedNameTokens(text: string, tokens: string[]): number {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);

  return tokens.filter((token) =>
    words.some((word) => namePartMatches(token, word)),
  ).length;
}

export function scoreFormgridRow(
  headers: string[],
  row: string[],
  tokens: string[],
): number {
  if (tokens.length === 0) return 0;

  const fullName = getFormgridClientName(headers, row);
  const matchedInName = countMatchedNameTokens(fullName, tokens);
  if (matchedInName > 0) {
    return matchedInName * 12;
  }

  const hay = row.join(" ");
  const matchedInRow = countMatchedNameTokens(hay, tokens);
  if (matchedInRow > 0) {
    return matchedInRow * 8;
  }

  return scoreNameInText(hay, tokens);
}

export function findFormgridRowByTokens(
  headers: string[],
  rows: string[][],
  tokens: string[],
): string[] | null {
  if (tokens.length === 0) return null;

  let best: { row: string[]; score: number } | null = null;
  for (const row of rows) {
    const score = scoreFormgridRow(headers, row, tokens);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { row, score };
    }
  }

  return best?.row ?? null;
}

export async function findFormgridRowByQuery(
  query: string,
): Promise<{ table: LeadsTableResult; row: string[] } | null> {
  const tokens = extractPersonNameTokens(query);
  if (tokens.length === 0) return null;

  const table = await getFormgridLeadsTable();
  const row = findFormgridRowByTokens(table.headers, table.rows, tokens);
  if (!row) return null;

  return { table, row };
}

export function formatFormgridRowDetailed(
  headers: string[],
  row: string[],
): string {
  const fields = getFormgridClientFields(headers, row);
  const lines = [
    `ФИО: ${fields.name}`,
    fields.submittedAt ? `Дата анкеты: ${fields.submittedAt}` : null,
    fields.passport ? `№ загранпаспорта: ${fields.passport}` : null,
    fields.email ? `Email: ${fields.email}` : null,
    fields.phone ? `Телефон: ${fields.phone}` : null,
    fields.birthDate ? `Дата рождения: ${fields.birthDate}` : null,
  ].filter(Boolean);

  return lines.join(" | ");
}

export type PersonFieldRequest = {
  passport: boolean;
  email: boolean;
  phone: boolean;
  birthDate: boolean;
};

export function detectPersonFieldRequest(query: string): PersonFieldRequest {
  const lower = query.toLowerCase();
  return {
    passport: /паспорт/i.test(lower),
    email: /email|почт|e-mail|электронн/i.test(lower),
    phone: /телефон|тел\.|phone|контактн/i.test(lower),
    birthDate: /дата рождения|родил/i.test(lower),
  };
}

export function hasPersonFieldRequest(request: PersonFieldRequest): boolean {
  return (
    request.passport ||
    request.email ||
    request.phone ||
    request.birthDate
  );
}
