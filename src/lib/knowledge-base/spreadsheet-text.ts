import "server-only";

import * as XLSX from "xlsx";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS_MIME = "application/vnd.ms-excel";

export function isSpreadsheetMime(mimeType: string): boolean {
  const mime = mimeType.toLowerCase();
  return (
    mime === XLSX_MIME ||
    mime === XLS_MIME ||
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel")
  );
}

export function isSpreadsheetFileName(name: string): boolean {
  return /\.(xlsx|xls|csv)$/i.test(name);
}

/** Convert workbook bytes to readable plain text (CSV per sheet). */
export function extractSpreadsheetText(
  buffer: Buffer,
  fileName?: string,
): string {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    dense: false,
  });

  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
    if (!csv) continue;
    if (workbook.SheetNames.length > 1) {
      parts.push(`## ${sheetName}\n${csv}`);
    } else {
      parts.push(csv);
    }
  }

  const text = parts.join("\n\n").trim();
  if (text) return text;
  return fileName
    ? `[Таблица пуста: ${fileName}]`
    : "[Таблица пуста]";
}
