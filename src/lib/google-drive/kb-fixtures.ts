/**
 * Deterministic Knowledge Base fixtures for AI-02 retrieval tests.
 * Safe fake text only — no production/customer data.
 */

export type KbFixtureDoc = {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  text: string;
  insideRoot: boolean;
};

export const KB_ROOT_ID = "kb-root-fixture";

/** Realistic nested KB tree under GOOGLE_DRIVE_KB_FOLDER_ID descendants. */
export const KB_FIXTURE_DOCS: KbFixtureDoc[] = [
  {
    id: "file-croatia-overview",
    name: "general-overview",
    path: "Croatia/general-overview",
    mimeType: "application/vnd.google-apps.document",
    text: "Обзор жизни в Хорватии. Климат, города, бытовые советы. Без деталей по визам.",
    insideRoot: true,
  },
  {
    id: "file-croatia-program",
    name: "program-information",
    path: "Croatia/program-information",
    mimeType: "text/plain",
    text: [
      "Вводный раздел о программах релокации.",
      "Далее подробности:",
      "Для получения ВНЖ digital nomad в Хорватии необходимо подтвердить удалённый доход,",
      "медицинскую страховку и отсутствие судимости.",
      "Список требований включает: паспорт, договор с клиентом или работодателем,",
      "выписку со счёта за последние 3 месяца.",
    ].join("\n"),
    insideRoot: true,
  },
  {
    id: "file-spain-dn",
    name: "digital-nomad",
    path: "Spain/digital-nomad",
    mimeType: "text/plain",
    text: "Испанская виза digital nomad: требования к доходу отличаются от хорватских. Нужен NIE и страховка.",
    insideRoot: true,
  },
  {
    id: "file-spain-residence",
    name: "residence-information",
    path: "Spain/residence-information",
    mimeType: "text/plain",
    text: "ВНЖ Испании по другим основаниям. Не относится к digital nomad Хорватии.",
    insideRoot: true,
  },
  {
    id: "file-nested-croatia-req",
    name: "requirements-document",
    path: "Nested/Croatia/requirements-document",
    mimeType: "text/plain",
    text: [
      "Документ без ключевых слов в названии файла.",
      "Раздел: требования.",
      "Какие требования для digital nomad в Хорватии:",
      "1) подтверждённый remote income;",
      "2) health insurance;",
      "3) clean criminal record.",
      "Эти требования относятся именно к программе Хорватии.",
    ].join(" "),
    insideRoot: true,
  },
  {
    id: "file-unrelated",
    name: "office-wifi-policy",
    path: "Internal/office-wifi-policy",
    mimeType: "text/plain",
    text: "Пароль от офисного Wi‑Fi и правила печати. Ничего про визы.",
    insideRoot: true,
  },
  {
    id: "file-late-match",
    name: "appendix-notes",
    path: "Croatia/appendix-notes",
    mimeType: "text/plain",
    text:
      `${"Вступление. ".repeat(80)}Ключевые требования для digital nomad в Хорватии указаны только в конце файла: доход, страховка, справка о несудимости.`,
    insideRoot: true,
  },
  {
    id: "file-outside-root",
    name: "digital-nomad-croatia-perfect-match",
    path: "Outside/digital-nomad-croatia-perfect-match",
    mimeType: "text/plain",
    text: "Идеальное совпадение: требования для digital nomad в Хорватии — полный список документов.",
    insideRoot: false,
  },
  {
    id: "file-image-scan",
    name: "scanned-requirements.jpg",
    path: "Croatia/scanned-requirements.jpg",
    mimeType: "image/jpeg",
    text: "",
    insideRoot: true,
  },
];

export function kbFixtureAllowedIds(): Set<string> {
  return new Set(
    KB_FIXTURE_DOCS.filter((doc) => doc.insideRoot).map((doc) => doc.id),
  );
}
