import type { StaffCaseDocument } from "@/lib/client-portal/staff-case-meta";

export const QUESTIONNAIRE_WORD_UPLOADER_ID = "system-questionnaire-word";
export const QUESTIONNAIRE_WORD_UPLOADER_NAME = "Система";

export type QuestionnaireWordRow = {
  section: string;
  label: string;
  value: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function slugifyQuestionnaireName(name: string): string {
  const slug = name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "klient";
}

export function questionnaireWordFilename(
  clientName: string,
  submittedAt: string | null | undefined,
): string {
  const day = (submittedAt ?? "").slice(0, 10) || "bez-daty";
  return `Anketa-klienta-${slugifyQuestionnaireName(clientName)}-${day}.doc`;
}

export function isQuestionnaireWordDocument(
  doc: Pick<StaffCaseDocument, "uploadedByUserId" | "fileName">,
): boolean {
  if (doc.uploadedByUserId === QUESTIONNAIRE_WORD_UPLOADER_ID) return true;
  return /^Anketa-klienta-/i.test(doc.fileName) && /\.docx?$/i.test(doc.fileName);
}

export function findQuestionnaireWordDocument(
  docs: StaffCaseDocument[],
): StaffCaseDocument | null {
  return docs.find(isQuestionnaireWordDocument) ?? null;
}

/** Word-compatible HTML (.doc) with questionnaire answers as a table. */
export function buildQuestionnaireWordDoc(input: {
  clientName: string;
  email: string;
  submittedAtLabel: string;
  rows: QuestionnaireWordRow[];
}): string {
  const bySection = new Map<string, QuestionnaireWordRow[]>();
  for (const row of input.rows) {
    const list = bySection.get(row.section) ?? [];
    list.push(row);
    bySection.set(row.section, list);
  }

  const sectionsHtml = [...bySection.entries()]
    .map(([section, rows]) => {
      const body = rows
        .map(
          (row) =>
            `<tr><td style="width:38%;vertical-align:top;"><strong>${escapeHtml(row.label)}</strong></td><td>${escapeHtml(row.value || "—")}</td></tr>`,
        )
        .join("");
      return `
  <h2>${escapeHtml(section)}</h2>
  <table>
    <tbody>${body}</tbody>
  </table>`;
    })
    .join("\n");

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>Анкета клиента — ${escapeHtml(input.clientName)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
    h2 { font-size: 1.05rem; margin: 1.4rem 0 0.55rem; color: #1f2937; }
    .meta { margin: 0 0 1.25rem; color: #444; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; max-width: 820px; margin: 0 0 0.75rem; }
    th, td { border: 1px solid #ccc; padding: 0.45rem 0.6rem; text-align: left; vertical-align: top; }
    th { background: #f3f3f3; }
  </style>
</head>
<body>
  <h1>Анкета клиента</h1>
  <p class="meta">
    Клиент: <strong>${escapeHtml(input.clientName)}</strong><br />
    Email: ${escapeHtml(input.email)}<br />
    Дата подачи: ${escapeHtml(input.submittedAtLabel)}
  </p>
  ${sectionsHtml || "<p>Нет заполненных полей.</p>"}
</body>
</html>`;
}

/** Browser preview twin of the Word file. */
export function buildQuestionnaireWordHtml(input: {
  clientName: string;
  email: string;
  submittedAtLabel: string;
  rows: QuestionnaireWordRow[];
}): string {
  return buildQuestionnaireWordDoc(input).replace(
    /xmlns:o="[^"]*"\s*xmlns:w="[^"]*"\s*xmlns="[^"]*"/,
    'lang="ru"',
  );
}
