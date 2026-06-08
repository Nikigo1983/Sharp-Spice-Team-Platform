import { parseAnyDate } from "@/lib/analytics/dates";

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function findSubmissionColumnIndex(headers: string[]): number {
  return headers.findIndex((header) =>
    /timestamp|submitted|created.?at|date.?submitted|response.?time|время.*ответ|дата.*отправ|дата.*заполн|дата.*создан|дата.*подач/i.test(
      header,
    ),
  );
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
