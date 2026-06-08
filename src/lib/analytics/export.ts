import type { CroatiaAnalytics } from "./types";

function escapeCsv(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values: Array<string | number | null | undefined>): string {
  return values.map(escapeCsv).join(",");
}

export function croatiaAnalyticsToCsv(data: CroatiaAnalytics): string {
  const lines: string[] = [];
  lines.push(`Период,${data.range.label}`);
  lines.push(`Источник,${data.source}`);
  lines.push("");

  lines.push("=== Общая статистика ===");
  lines.push(row(["Показатель", "Значение"]));
  lines.push(row(["Подано заявок", data.overview.submitted]));
  lines.push(row(["Одобрено ВНЖ", data.overview.approved]));
  lines.push(row(["Активных дел", data.overview.activeCases]));
  lines.push(row(["Средний срок", data.overview.avgProcessingDays ?? "—"]));
  lines.push(row(["Самое быстрое", data.overview.fastestDays ?? "—"]));
  lines.push(row(["Самое долгое", data.overview.slowestDays ?? "—"]));
  lines.push("");

  lines.push("=== Инспекторы MUP ===");
  lines.push(
    row([
      "Инспектор",
      "Активных",
      "Завершено",
      "Средний срок",
      "Быстрее всего",
      "Дольше всего",
    ]),
  );
  for (const i of data.inspectors) {
    lines.push(
      row([
        i.inspector,
        i.activeCases,
        i.completedCases,
        i.avgProcessingDays ?? "—",
        i.fastestDays ?? "—",
        i.slowestDays ?? "—",
      ]),
    );
  }
  lines.push("");

  lines.push("=== Визы D ===");
  lines.push(
    row([
      "Консульство",
      "Подано",
      "Одобрено",
      "Отказано",
      "% одобрения",
      "Средний срок",
    ]),
  );
  for (const v of data.visaD.consulates) {
    lines.push(
      row([
        v.consulate,
        v.submitted,
        v.approved,
        v.rejected,
        v.approvalRate,
        v.avgProcessingDays ?? "—",
      ]),
    );
  }
  lines.push("");

  lines.push("=== Адреса ===");
  lines.push(
    row(["Адрес", "Активных", "Всего", "Одобрено", "Нагрузка"]),
  );
  for (const a of data.addresses) {
    lines.push(
      row([
        a.address,
        a.activeClients,
        a.totalClients,
        a.approvedCount,
        a.loadLevel,
      ]),
    );
  }

  return lines.join("\n");
}

export function downloadBlob(
  content: string,
  filename: string,
  mime: string,
): void {
  const blob = new Blob(["\uFEFF" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCroatiaExcel(data: CroatiaAnalytics): void {
  downloadBlob(
    croatiaAnalyticsToCsv(data),
    `analytics-croatia-${data.range.preset}.csv`,
    "text/csv;charset=utf-8",
  );
}

export function exportCroatiaPdf(): void {
  window.print();
}
