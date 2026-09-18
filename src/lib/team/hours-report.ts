import type { MemberActivityStats } from "@/lib/presence/daily-activity-logic";
import { rowsToCsv } from "@/lib/export/download-csv";

export type HoursReportMeta = {
  memberName: string;
  memberEmail: string;
  periodLabel: string;
  rangeLabel: string;
  totalLabel: string;
  generatedAtLabel: string;
};

export type HoursReportRow = {
  label: string;
  onlineLabel: string;
  startedLabel: string;
  endedLabel: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function slugifyReportName(name: string): string {
  const slug = name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "sotrudnik";
}

export function hoursReportFilename(
  memberName: string,
  period: string,
  rangeLabel: string,
): string {
  const rangeSlug = rangeLabel
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `otchet-chasov-${slugifyReportName(memberName)}-${period}-${rangeSlug || "period"}.csv`;
}

export function buildHoursReportTable(
  stats: MemberActivityStats,
  formatDay: (dayKey: string) => string,
  formatMonth: (monthKey: string) => string,
  formatOnline: (onlineMs: number) => string,
  formatClock: (iso: string | null | undefined) => string,
): HoursReportRow[] {
  if (stats.period === "year") {
    return stats.months.map((month) => ({
      label: formatMonth(month.monthKey),
      onlineLabel: formatOnline(month.onlineMs),
      startedLabel: "—",
      endedLabel: "—",
    }));
  }

  return stats.days.map((day) => ({
    label: formatDay(day.date),
    onlineLabel: formatOnline(day.onlineMs),
    startedLabel: day.onlineMs > 0 ? formatClock(day.startedAt) : "—",
    endedLabel: day.onlineMs > 0 ? formatClock(day.endedAt) : "—",
  }));
}

export function buildHoursReportCsv(
  meta: HoursReportMeta,
  rows: HoursReportRow[],
  mode: "days" | "months",
): string {
  const headers =
    mode === "months"
      ? ["Месяц", "Онлайн"]
      : ["Дата", "Онлайн", "Начало", "Окончание"];

  const csvRows =
    mode === "months"
      ? rows.map((row) => [row.label, row.onlineLabel])
      : rows.map((row) => [
          row.label,
          row.onlineLabel,
          row.startedLabel,
          row.endedLabel,
        ]);

  const summary = rowsToCsv(
    ["Сотрудник", "Email", "Период", "Диапазон", "Всего", "Сформирован"],
    [
      [
        meta.memberName,
        meta.memberEmail,
        meta.periodLabel,
        meta.rangeLabel,
        meta.totalLabel,
        meta.generatedAtLabel,
      ],
    ],
  );

  return `${summary}\r\n\r\n${rowsToCsv(headers, csvRows).replace(/^\uFEFF/, "")}`;
}

export function buildHoursReportHtml(
  meta: HoursReportMeta,
  rows: HoursReportRow[],
  mode: "days" | "months",
): string {
  const isYear = mode === "months";
  const headCells = isYear
    ? "<th>Месяц</th><th>Онлайн</th>"
    : "<th>Дата</th><th>Онлайн</th><th>Начало</th><th>Окончание</th>";
  const body = rows
    .map((row) =>
      isYear
        ? `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.onlineLabel)}</td></tr>`
        : `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.onlineLabel)}</td><td>${escapeHtml(row.startedLabel)}</td><td>${escapeHtml(row.endedLabel)}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Отчёт об отработанных часах — ${escapeHtml(meta.memberName)}</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
    .meta { margin: 0 0 1.25rem; color: #444; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; max-width: 720px; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 0.65rem; text-align: left; }
    th { background: #f3f3f3; }
    tfoot td { font-weight: 600; }
  </style>
</head>
<body>
  <h1>Отчёт об отработанных часах</h1>
  <p class="meta">
    Сотрудник: <strong>${escapeHtml(meta.memberName)}</strong><br />
    Email: ${escapeHtml(meta.memberEmail)}<br />
    Период: ${escapeHtml(meta.periodLabel)} · ${escapeHtml(meta.rangeLabel)}<br />
    Всего: <strong>${escapeHtml(meta.totalLabel)}</strong><br />
    Сформирован: ${escapeHtml(meta.generatedAtLabel)}
  </p>
  <table>
    <thead><tr>${headCells}</tr></thead>
    <tbody>${body}</tbody>
    <tfoot>
      <tr>
        <td${isYear ? "" : ' colspan="3"'}>Итого</td>
        <td>${escapeHtml(meta.totalLabel)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function openHtmlReport(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), opened ? 60_000 : 0);
}
