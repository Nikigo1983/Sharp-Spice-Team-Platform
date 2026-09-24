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
    @page {
      size: A4 landscape;
      margin: 1cm;
    }
    @page WordSection1 {
      size: 841.95pt 595.35pt;
      mso-page-orientation: landscape;
      margin: 28.35pt 28.35pt 28.35pt 28.35pt;
    }
    div.WordSection1 { page: WordSection1; }
    body { font-family: Segoe UI, Arial, sans-serif; margin: 0.75rem; color: #111; }
    h1 { font-size: 1.15rem; margin: 0 0 0.35rem; }
    .meta { margin: 0 0 0.3rem; color: #444; line-height: 1.4; font-size: 0.85rem; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-top: 0.75rem;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 0.25rem 0.35rem;
      text-align: left;
      vertical-align: top;
      font-size: 0.72rem;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    th { background: #f3f3f3; font-weight: 600; }
  </style>
</head>
<body>
  <div class="WordSection1">
  <h1>${escapeHtml(input.title)}</h1>
  ${subtitle}
  <p class="meta">Записей: <strong>${count}</strong> · Сформировано: ${escapeHtml(generated)}</p>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>
${bodyRows}
    </tbody>
  </table>
  </div>
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
 * Open the list in a new browser tab (HTML preview of the Word table).
 * Falls back to .doc download if the pop-up is blocked.
 */
export function openClientListWord(
  input: ClientListWordExportInput,
  filename: string,
): void {
  const html = buildClientListWordDoc(input);
  // text/html opens in the tab; application/msword usually forces a download.
  const previewBlob = new Blob(["\ufeff", html], {
    type: "text/html;charset=utf-8",
  });
  const url = URL.createObjectURL(previewBlob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    URL.revokeObjectURL(url);
    downloadClientListWord(input, filename);
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
