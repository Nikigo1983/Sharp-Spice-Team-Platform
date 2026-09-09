/** Client-safe CSV download helper (UTF-8 BOM for Excel). */

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) =>
      headers.map((_, index) => escapeCsvCell(row[index] ?? "")).join(","),
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: string[][],
): void {
  const blob = new Blob([rowsToCsv(headers, rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function uniqueSortedValues(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (!trimmed || trimmed === "—") continue;
    set.add(trimmed);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));
}
