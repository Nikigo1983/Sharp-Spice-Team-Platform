import { parseAnyDate } from "@/lib/analytics/dates";

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function findSubmissionColumnIndex(headers: string[]): number {
  return headers.findIndex((header) =>
    /^date$/i.test(header.trim()) ||
    /timestamp|submitted|created.?at|date.?submitted|response.?time|время.*ответ|дата.*отправ|дата.*заполн|дата.*создан|дата.*подач/i.test(
      header,
    ),
  );
}

function findNameColumnIndex(headers: string[]): number {
  const idx = headers.findIndex((header) =>
    /фамилия.*имя|фио.*кирил|1\.\s*фамилия/i.test(header),
  );
  if (idx >= 0) return idx;
  return headers.findIndex((header) => /имя|name|фио/i.test(header));
}

function findEmailColumnIndex(headers: string[]): number {
  return headers.findIndex((header) => /email|почта|e-mail/i.test(header));
}

export function getFormgridClientName(
  headers: string[],
  row: string[],
): string {
  const nameIdx = findNameColumnIndex(headers);
  const value = nameIdx >= 0 ? row[nameIdx]?.trim() : "";
  return value || row[0]?.trim() || "Без имени";
}

export function formatFormgridRowSummary(
  headers: string[],
  row: string[],
): string {
  const submitted = getFormgridSubmissionDate(headers, row);
  const dateStr = submitted
    ? submitted.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";
  const name = getFormgridClientName(headers, row);
  const emailIdx = findEmailColumnIndex(headers);
  const email = emailIdx >= 0 ? row[emailIdx]?.trim() : "";
  return email
    ? `${dateStr} | ${name} | ${email}`
    : `${dateStr} | ${name}`;
}

export function sortFormgridRowsByDate(
  headers: string[],
  rows: string[][],
): string[][] {
  return [...rows].sort((a, b) => {
    const dateA = getFormgridSubmissionDate(headers, a)?.getTime() ?? 0;
    const dateB = getFormgridSubmissionDate(headers, b)?.getTime() ?? 0;
    return dateB - dateA;
  });
}

const DAY_WORDS: Record<string, number> = {
  один: 1,
  одну: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
};

export function parseRecentDaysFromQuery(query: string): number | null {
  const lower = query.toLowerCase();
  const match = lower.match(
    /(?:последн\w*|за)\s+(\d{1,2}|[а-яё]+)\s+дн/i,
  );
  if (!match) return null;

  const raw = match[1].trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  return DAY_WORDS[raw] ?? null;
}

export function listFormgridRowsSince(
  headers: string[],
  rows: string[][],
  since: Date,
): string[][] {
  return sortFormgridRowsByDate(headers, rows).filter((row) => {
    const submitted = getFormgridSubmissionDate(headers, row);
    return submitted !== null && submitted >= since;
  });
}

/**
 * Дата подачи анкеты Formgrid — обычно ISO-метка в последней колонке.
 * Нельзя брать первую попавшуюся дату в строке (там дата рождения, паспорт и т.д.).
 */
export function getFormgridSubmissionDate(
  headers: string[],
  row: string[],
): Date | null {
  const colIdx = findSubmissionColumnIndex(headers);
  if (colIdx >= 0) {
    const fromHeader = parseAnyDate(row[colIdx]);
    if (fromHeader) return fromHeader;
  }

  for (let i = row.length - 1; i >= 0; i--) {
    const cell = (row[i] ?? "").trim();
    if (!cell || !ISO_TIMESTAMP.test(cell)) continue;
    const parsed = parseAnyDate(cell);
    if (parsed) return parsed;
  }

  let latestIso: Date | null = null;
  for (const cell of row) {
    const trimmed = (cell ?? "").trim();
    if (!ISO_TIMESTAMP.test(trimmed)) continue;
    const parsed = parseAnyDate(trimmed);
    if (parsed && (!latestIso || parsed > latestIso)) latestIso = parsed;
  }
  if (latestIso) return latestIso;

  for (let i = row.length - 1; i >= 0; i--) {
    const parsed = parseAnyDate(row[i]);
    if (parsed) return parsed;
  }

  return null;
}

export function countFormgridRowsSince(
  headers: string[],
  rows: string[][],
  since: Date,
): number {
  let count = 0;
  for (const row of rows) {
    const submitted = getFormgridSubmissionDate(headers, row);
    if (submitted && submitted >= since) count++;
  }
  return count;
}
