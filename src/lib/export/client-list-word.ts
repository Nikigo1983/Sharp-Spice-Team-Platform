/**
 * Client-side Word-compatible (.doc HTML) export for filtered client lists.
 * Same Open / Download pattern as questionnaire Word exports — no new deps.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ClientListWordExportInput = {
  title: string;
  /** Optional filter summary shown under the title. */
  subtitle?: string | null;
  headers: string[];
  rows: string[][];
  generatedAt?: Date;
};

export function buildClientListWordDoc(input: ClientListWordExportInput): string {
  const generated = (input.generatedAt ?? new Date()).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const count = input.rows.length;
  const headerCells = input.headers
    .map((h) => `<th>${escapeHtml(h || "—")}</th>`)
    .join("");
  const bodyRows = input.rows
    .map((row) => {
      const cells = input.headers
        .map((_, i) => `<td>${escapeHtml((row[i] ?? "").trim() || "—")}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("\n");

  const subtitle = input.subtitle?.trim()
    ? `<p class="meta">${escapeHtml(input.subtitle.trim())}</p>`
    : "";

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 1.5rem; color: #111; }
    h1 { font-size: 1.35rem; margin: 0 0 0.4rem; }
    .meta { margin: 0 0 0.35rem; color: #444; line-height: 1.45; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.5rem; text-align: left; vertical-align: top; font-size: 0.9rem; }
    th { background: #f3f3f3; }
  </style>
</head>
<body>
  <h1>${escapeHtml(input.title)}</h1>
  ${subtitle}
  <p class="meta">Записей: <strong>${count}</strong> · Сформировано: ${escapeHtml(generated)}</p>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>
${bodyRows}
    </tbody>
  </table>
</body>
</html>`;
}

function wordBlob(html: string): Blob {
  return new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
}

export function clientListWordFilename(prefix: string, when = new Date()): string {
  const safe = prefix
    .trim()
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${safe || "spisok-klientov"}-${when.toISOString().slice(0, 10)}.doc`;
}

/** Download filtered list as .doc (attachment). */
export function downloadClientListWord(
  input: ClientListWordExportInput,
  filename: string,
): void {
  const blob = wordBlob(buildClientListWordDoc(input));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Open filtered list in a new tab (browser / Word may handle .doc).
 * Falls back to download if pop-up is blocked.
 */
export function openClientListWord(
  input: ClientListWordExportInput,
  filename: string,
): void {
  const blob = wordBlob(buildClientListWordDoc(input));
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
