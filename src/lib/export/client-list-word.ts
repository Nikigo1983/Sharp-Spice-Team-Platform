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
 * Fallback when desktop Word cannot be launched: save a real .doc file.
 * Prefer {@link openClientListWordInDesktopApp} on staff desktops.
 */
export function openClientListWord(
  input: ClientListWordExportInput,
  filename: string,
): void {
  downloadClientListWord(input, filename);
}

export type OpenClientListWordResult = "opened" | "downloaded";

type OfficeLinkResponse = {
  launchUrl?: string;
  msWordUri?: string;
  msWordUriAbbreviated?: string;
  error?: string;
};

/**
 * Open the filtered list in desktop Microsoft Word (same protocol path as
 * case-file Word open). Falls back to downloading a .doc on phones / errors.
 */
export async function openClientListWordInDesktopApp(
  input: ClientListWordExportInput,
  filename: string,
  options: {
    supportsDesktopMsWord: boolean;
    launchMsWord: (input: {
      launchUrl?: string;
      msWordUri: string;
      abbreviatedUri?: string;
    }) => void;
  },
): Promise<OpenClientListWordResult> {
  if (!options.supportsDesktopMsWord) {
    downloadClientListWord(input, filename);
    return "downloaded";
  }

  try {
    const res = await fetch("/api/exports/list-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, filename }),
    });
    const data = (await res.json().catch(() => ({}))) as OfficeLinkResponse;
    if (!res.ok || !data.msWordUri) {
      downloadClientListWord(input, filename);
      return "downloaded";
    }
    options.launchMsWord({
      launchUrl: data.launchUrl,
      msWordUri: data.msWordUri,
      abbreviatedUri: data.msWordUriAbbreviated,
    });
    return "opened";
  } catch {
    downloadClientListWord(input, filename);
    return "downloaded";
  }
}
