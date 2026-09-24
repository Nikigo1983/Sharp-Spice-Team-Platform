/**
 * Map Formgrid «Новые лиды» sheet rows into portal questionnaire answers
 * for import into Emigrant intake (client_cases / questionnaires).
 * Pure module — usable from Node scripts (no path aliases / server-only).
 */

import { formatCyrillicNameIof, formatLatinNameIof } from "./person-name-order";

export const FORMGRID_SOURCE = "formgrid" as const;
export const FORMGRID_IMPORT_KEY = "__import";
export const FORMGRID_SHEET_KEY = "__formgridSheet";
/** Original Formgrid column order (header order) for stable review UI. */
export const FORMGRID_SHEET_ORDER_KEY = "__formgridSheetOrder";
export const FORMGRID_FILES_KEY = "__formgridFiles";
/** Staff CRM process fields (same labels as External sheet / legacy intake). */
export const FORMGRID_CRM_OPS_KEY = "__crmOpsSheet";

/** Section title in intake questionnaire review (staff-editable ops fields). */
export const MANAGER_FILL_SECTION = "Для заполнения менеджером";

export const FORMGRID_CRM_OPS_COLUMNS = [
  "Дата подачи",
  "Дата предпологаемого одобрения",
  "Имя референта",
  "Адрес букинга",
  "Дата букинга (от и до)",
  "Дата одобрения ВНЖ",
  "Дата выдачи карточки ВНЖ",
  "Партнер от кого клиент",
  "Договор",
  "ТИП ЗАНЯТОСТИ",
  "СВИДЕТЕЛЬСТВО О РЕГИСТРАЦИИ КОМПАНИИ",
  "Адвокат",
  "СПРАВКА О НЕСУДИМОСТИ",
  "ПОДПИСЬ КЛИЕНТА",
  "медстраховка",
] as const;

export type FormgridCrmOpsColumn = (typeof FORMGRID_CRM_OPS_COLUMNS)[number];
export type FormgridCrmOpsSheet = Record<FormgridCrmOpsColumn, string>;

export type FormgridSheetRow = Record<string, string>;

export type FormgridStoredFile = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceUrl: string;
  sheetColumn: string;
  storedAt: string;
};

export type FormgridImportMeta = {
  source: typeof FORMGRID_SOURCE;
  formgridLeadId: string;
  sheetRow: number | null;
  fingerprint: string;
  importedAt: string;
  submittedAt: string | null;
  /**
   * When true, case is in the «Новый клиент» queue (yellow badge + Formgrid-new filter)
   * until staff clicks «Заявка подана». Historical bulk imports omit this.
   */
  newClientQueue?: boolean;
};

export type FormgridImportAnswers = Record<string, unknown> & {
  __import: FormgridImportMeta;
  __formgridSheet: FormgridSheetRow;
  __formgridSheetOrder?: string[];
  __formgridFiles?: Record<string, FormgridStoredFile>;
  __crmOpsSheet?: Partial<FormgridCrmOpsSheet>;
};

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function findValue(row: FormgridSheetRow, predicates: Array<(key: string) => boolean>): string {
  for (const [key, value] of Object.entries(row)) {
    const k = key.toLowerCase();
    if (predicates.some((fn) => fn(k))) {
      const v = clean(value);
      if (v) return v;
    }
  }
  return "";
}

function findByNumber(row: FormgridSheetRow, n: number): string {
  const re = new RegExp(`(?:^|\\D)${n}(?:\\.|\\)|\\s)`);
  for (const [key, value] of Object.entries(row)) {
    if (re.test(key)) {
      const v = clean(value);
      if (v) return v;
    }
  }
  return "";
}

function hashFingerprint(base: string): string {
  let hash = 2166136261;
  for (let i = 0; i < base.length; i++) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Extract client-facing fields the same way as Formgrid lead review. */
export function extractFormgridClientFields(row: FormgridSheetRow): {
  fullName: string;
  email: string;
  phone: string;
  passport: string;
  dateOfBirth: string;
  citizenship: string;
  address: string;
  purpose: string;
  comment: string;
  submittedAt: string;
} {
  const fullName =
    findValue(row, [
      (k) => k.includes("фио") && k.includes("кирилл"),
      (k) => k.includes("full") && k.includes("name") && !k.includes("latin"),
      (k) => /(^|\D)1(\.|\)|\s)/.test(k) && (k.includes("фио") || k.includes("имя")),
    ]) ||
    findByNumber(row, 1) ||
    findValue(row, [(k) => k.includes("фио") || (k.includes("имя") && k.includes("фамилия"))]);

  const email = findValue(row, [
    (k) => k.includes("email") || k.includes("e-mail") || k.includes("почт"),
    (k) => k.includes("электронн") && k.includes("адрес"),
  ]);

  const phone =
    findValue(row, [(k) => k.includes("телефон") || k.includes("phone") || k.includes("тел.")]) ||
    findByNumber(row, 7);

  // Formgrid sheet uses «8. № заграничного паспорта» (not 13).
  const passport =
    findValue(row, [(k) => k.includes("паспорт") || k.includes("passport")]) || findByNumber(row, 8);

  const dateOfBirth =
    findValue(row, [
      (k) => k.includes("дат") && k.includes("рожд"),
      (k) => k.includes("date") && k.includes("birth"),
      (k) => k.includes("birthday") || k.includes("dob"),
    ]) || findByNumber(row, 4);

  const citizenship =
    findValue(row, [
      (k) => k.includes("гражданств") || k.includes("citizenship"),
    ]) || findByNumber(row, 10);

  const address =
    findValue(row, [
      (k) => k.includes("место жительства") || k.includes("прожив"),
      (k) => (k.includes("адрес") || k.includes("address")) && !k.includes("электронн"),
    ]) || findByNumber(row, 6);

  const purpose = findValue(row, [
    (k) => k.includes("почему") && k.includes("хорват"),
    (k) => k.includes("цель"),
    (k) => k.includes("purpose"),
  ]);

  const comment = findValue(row, [
    (k) => k.includes("коммент") || k.includes("comment") || k.includes("примечан"),
  ]);

  const submittedAt =
    findValue(row, [
      (k) => k.includes("timestamp"),
      (k) => k.includes("дата") && k.includes("отправ"),
      (k) => k.includes("submitted"),
    ]) || "";

  return {
    fullName,
    email,
    phone,
    passport,
    dateOfBirth,
    citizenship,
    address,
    purpose,
    comment,
    submittedAt,
  };
}

/** Stable short fingerprint for idempotent portal ids. */
export function formgridFingerprint(row: FormgridSheetRow, leadId: string): string {
  const fields = extractFormgridClientFields(row);
  const passport = fields.passport.toLowerCase().replace(/\s+/g, "");
  const email = fields.email.toLowerCase();
  const base =
    passport ||
    (email.includes("@") ? email : "") ||
    `formgrid|${leadId}|${fields.fullName.toLowerCase()}|${fields.phone}|${fields.submittedAt}`;
  return hashFingerprint(base);
}

export function formgridUserId(fingerprint: string): string {
  return `formgrid-user-${fingerprint}`;
}

export function formgridQuestionnaireId(fingerprint: string): string {
  return `formgrid-q-${fingerprint}`;
}

export function isFormgridImport(
  answers: Record<string, unknown> | null | undefined,
): boolean {
  const meta = answers?.[FORMGRID_IMPORT_KEY];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return (meta as { source?: string }).source === FORMGRID_SOURCE;
}

/** Formgrid case waiting in the yellow «Новый клиент» queue. */
export function isFormgridNewClientQueue(
  answers: Record<string, unknown> | null | undefined,
): boolean {
  if (!isFormgridImport(answers)) return false;
  const meta = answers?.[FORMGRID_IMPORT_KEY];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return (meta as { newClientQueue?: unknown }).newClientQueue === true;
}

export function setFormgridNewClientQueue(
  answers: Record<string, unknown>,
  enabled: boolean,
): Record<string, unknown> {
  const raw = answers[FORMGRID_IMPORT_KEY];
  const meta: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : { source: FORMGRID_SOURCE };
  if (enabled) {
    meta.newClientQueue = true;
  } else {
    delete meta.newClientQueue;
  }
  return {
    ...answers,
    [FORMGRID_IMPORT_KEY]: meta,
  };
}

export function mapFormgridRowToAnswers(
  row: FormgridSheetRow,
  opts: {
    leadId: string;
    sheetRow?: number | null;
    fingerprint: string;
    importedAt?: string;
    newClientQueue?: boolean;
  },
): FormgridImportAnswers {
  const importedAt = opts.importedAt ?? new Date().toISOString();
  const f = extractFormgridClientFields(row);
  const nameLatin =
    findValue(row, [(k) => k.includes("фио") && (k.includes("латин") || k.includes("latin"))]) ||
    findByNumber(row, 2) ||
    f.fullName;
  const birthSurname =
    findValue(row, [(k) => k.includes("фамил") && k.includes("рожден")]) || findByNumber(row, 3);
  const placeOfBirth =
    findValue(row, [(k) => k.includes("место") && k.includes("рожд")]) || findByNumber(row, 5);
  const education = findValue(row, [
    (k) => k.includes("образован") || k.includes("специальност") || k.includes("education"),
  ]);
  const passportIssued = findValue(row, [
    (k) => k.includes("орган") && k.includes("выдав"),
    (k) => k.includes("кем выдан") || (k.includes("issued") && k.includes("by")),
  ]);
  const passportIssueDate = findValue(row, [
    (k) => k.includes("дата выдачи"),
    (k) => (k.includes("когда") && k.includes("выдан")) || k.includes("issue date"),
  ]);
  const passportExpiry = findValue(row, [
    (k) => k.includes("дата окончания") || k.includes("expiry") || k.includes("окончания"),
  ]);
  const marital =
    findValue(row, [(k) => k.includes("семейное") || k.includes("marital")]) || findByNumber(row, 12);
  const nationality =
    findValue(row, [(k) => k.includes("национальн") || k.includes("nationality")]) ||
    findByNumber(row, 11);
  const father =
    findValue(row, [(k) => k.includes("отец")]) || findByNumber(row, 13);
  const mother =
    findValue(row, [(k) => k.includes("мать")]) || findByNumber(row, 14);
  const howLearned = findValue(row, [
    (k) => k.includes("как вы узнали") || k.includes("узнали о программе"),
  ]);
  const hadCroatiaTrp = findValue(row, [
    (k) => k.includes("временный вид") && k.includes("хорват"),
  ]);
  const hadOtherTrp = findValue(row, [
    (k) => k.includes("временный вид") && k.includes("другой"),
  ]);
  const workExperience = findValue(row, [
    (k) => k.includes("чем именно вы занимаетесь") || k.includes("опыт"),
  ]);
  const visitedCroatia = findValue(row, [
    (k) => k.includes("бывали") && k.includes("хорват"),
  ]);
  const travelHistory = findValue(row, [
    (k) => k.includes("в каких странах") || k.includes("travel"),
  ]);

  return {
    full_name_cyrillic: f.fullName
      ? formatCyrillicNameIof(f.fullName) || null
      : null,
    full_name_latin: nameLatin
      ? formatLatinNameIof(nameLatin) || null
      : null,
    birth_surname_latin: birthSurname || null,
    date_of_birth: f.dateOfBirth || null,
    place_of_birth_latin: placeOfBirth || null,
    residence_address_latin: f.address || null,
    phone: f.phone || null,
    contact_email: f.email || null,
    passport_number: f.passport || null,
    passport_issued_by: passportIssued || null,
    passport_issue_date: passportIssueDate || null,
    passport_expiry_date: passportExpiry || null,
    education_specialty_latin: education || null,
    citizenship_latin: f.citizenship || null,
    nationality_latin: nationality || null,
    marital_status_latin: marital || null,
    father_name_latin: father || null,
    mother_name_latin: mother || null,
    why_croatia: f.purpose || null,
    how_learned_program: howLearned || null,
    had_croatia_trp: /^(да|yes|true|1)$/i.test(hadCroatiaTrp)
      ? "yes"
      : /^(нет|no|false|0)$/i.test(hadCroatiaTrp)
        ? "no"
        : hadCroatiaTrp || null,
    had_other_country_trp: /^(да|yes|true|1)$/i.test(hadOtherTrp)
      ? "yes"
      : /^(нет|no|false|0)$/i.test(hadOtherTrp)
        ? "no"
        : hadOtherTrp || null,
    work_experience: workExperience || null,
    visited_croatia_before: /^(да|yes|true|1)$/i.test(visitedCroatia)
      ? "yes"
      : /^(нет|no|false|0)$/i.test(visitedCroatia)
        ? "no"
        : visitedCroatia || null,
    travel_history: travelHistory || f.comment || null,
    consent_personal_data: true,
    [FORMGRID_IMPORT_KEY]: {
      source: FORMGRID_SOURCE,
      formgridLeadId: opts.leadId,
      sheetRow: opts.sheetRow ?? null,
      fingerprint: opts.fingerprint,
      importedAt,
      submittedAt: f.submittedAt || null,
      ...(opts.newClientQueue ? { newClientQueue: true as const } : {}),
    },
    [FORMGRID_SHEET_KEY]: { ...row },
    [FORMGRID_SHEET_ORDER_KEY]: Object.keys(row),
    [FORMGRID_CRM_OPS_KEY]: emptyFormgridCrmOpsSheet({
      "Дата подачи": f.submittedAt || "",
    }),
  };
}

export function emptyFormgridCrmOpsSheet(
  seed: Partial<FormgridCrmOpsSheet> = {},
): FormgridCrmOpsSheet {
  const out = {} as FormgridCrmOpsSheet;
  for (const key of FORMGRID_CRM_OPS_COLUMNS) {
    out[key] = clean(seed[key]);
  }
  return out;
}

export function readFormgridCrmOpsSheet(
  answers: Record<string, unknown> | null | undefined,
): FormgridCrmOpsSheet {
  const raw = answers?.[FORMGRID_CRM_OPS_KEY];
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return emptyFormgridCrmOpsSheet(
    Object.fromEntries(
      FORMGRID_CRM_OPS_COLUMNS.map((key) => [key, clean(obj[key])]),
    ) as Partial<FormgridCrmOpsSheet>,
  );
}

export function applyFormgridCrmOpsEdits(
  answers: Record<string, unknown>,
  fields: Record<string, string>,
): Record<string, unknown> {
  const current = readFormgridCrmOpsSheet(answers);
  for (const key of FORMGRID_CRM_OPS_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      current[key] = clean(fields[key]);
    }
  }

  const existingStaff =
    answers.__staff &&
    typeof answers.__staff === "object" &&
    !Array.isArray(answers.__staff)
      ? { ...(answers.__staff as Record<string, string>) }
      : {};

  return {
    ...answers,
    [FORMGRID_CRM_OPS_KEY]: current,
    __staff: {
      ...existingStaff,
      curator: current["Имя референта"],
      expectedApproval: current["Дата предпологаемого одобрения"],
      bookingAddress: current["Адрес букинга"],
      bookingDate: current["Дата букинга (от и до)"],
      trpApprovalDate: current["Дата одобрения ВНЖ"],
      trpCardIssueDate: current["Дата выдачи карточки ВНЖ"],
      partner: current["Партнер от кого клиент"],
      lawyer: current["Адвокат"],
    },
  };
}

export function displayNameFromFormgridAnswers(answers: Record<string, unknown>): string {
  const cyrillic = clean(answers.full_name_cyrillic);
  return (
    (cyrillic ? formatCyrillicNameIof(cyrillic) : "") ||
    clean(answers.full_name_latin) ||
    clean(answers.contact_email) ||
    "Formgrid lead"
  );
}

export function syntheticEmailFromFormgrid(leadId: string, email: string): string {
  const real = clean(email).toLowerCase();
  if (real.includes("@")) return real;
  const slug = leadId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "lead";
  return `formgrid-${slug}@import.local`;
}

/** Prefer showing the original Formgrid sheet columns in staff review. */
export function isExternalFileUrl(value: string): boolean {
  const s = clean(value);
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    const path = u.pathname.toLowerCase();
    return (
      u.hostname.includes("formgrid.com") ||
      path.endsWith(".pdf") ||
      path.endsWith(".jpg") ||
      path.endsWith(".jpeg") ||
      path.endsWith(".png") ||
      path.endsWith(".webp") ||
      path.endsWith(".doc") ||
      path.endsWith(".docx") ||
      path.includes("/response-files/") ||
      path.includes("/download")
    );
  } catch {
    return false;
  }
}

export function fileNameFromExternalUrl(url: string, fallbackLabel: string): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    if (last && last !== "download" && last !== "download.pdf") return last;
    if (last === "download.pdf") {
      const fromQuery = u.searchParams.get("filename") || u.searchParams.get("name");
      if (fromQuery) return fromQuery;
    }
  } catch {
    // ignore
  }
  const cleaned = clean(fallbackLabel)
    .replace(/\s*\(только pdf\)\s*/i, "")
    .replace(/\s*\(pdf only\)\s*/i, "")
    .trim();
  return cleaned || "Документ Formgrid";
}

export function readFormgridStoredFiles(
  answers: Record<string, unknown> | null | undefined,
): Record<string, FormgridStoredFile> {
  const raw = answers?.[FORMGRID_FILES_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, FormgridStoredFile> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const rec = value as Record<string, unknown>;
    if (
      typeof rec.id !== "string" ||
      typeof rec.fileName !== "string" ||
      typeof rec.mimeType !== "string" ||
      typeof rec.sizeBytes !== "number"
    ) {
      continue;
    }
    out[key] = {
      id: rec.id,
      fileName: rec.fileName,
      mimeType: rec.mimeType,
      sizeBytes: rec.sizeBytes,
      sourceUrl: typeof rec.sourceUrl === "string" ? rec.sourceUrl : "",
      sheetColumn: typeof rec.sheetColumn === "string" ? rec.sheetColumn : key,
      storedAt: typeof rec.storedAt === "string" ? rec.storedAt : "",
    };
  }
  return out;
}

/** Map Formgrid sheet column labels onto portal questionnaire file fields when possible. */
export function guessPortalFileQuestionId(columnLabel: string): string | null {
  const k = columnLabel.toLowerCase();
  if (k.includes("паспорт") || k.includes("passport")) return "doc_passport_pdf";
  if (k.includes("несудимост") || k.includes("criminal") || k.includes("police")) {
    return "doc_criminal_record_pdf";
  }
  if (k.includes("банк") || k.includes("bank") || k.includes("выписк")) {
    return "doc_bank_statement_pdf";
  }
  if (k.includes("договор") || k.includes("contract") || k.includes("трудов")) {
    return "doc_contract_pdf";
  }
  if (k.includes("подпис") || k.includes("signature")) return "doc_signature_sample";
  if (k.includes("внж") || k.includes("trp") || k.includes("вид на жительств")) {
    return "doc_other_country_trp_pdf";
  }
  return null;
}

export function listFormgridExternalFileEntries(
  answers: Record<string, unknown>,
): Array<{ column: string; url: string }> {
  const sheet = answers[FORMGRID_SHEET_KEY];
  const sheetObj =
    sheet && typeof sheet === "object" && !Array.isArray(sheet)
      ? (sheet as Record<string, unknown>)
      : {};
  const out: Array<{ column: string; url: string }> = [];
  for (const [column, value] of Object.entries(sheetObj)) {
    const url = clean(value);
    if (isExternalFileUrl(url)) out.push({ column, url });
  }
  return out;
}

export function buildFormgridReviewRows(
  answers: Record<string, unknown>,
  _locale: "ru" | "en" = "ru",
): Array<{
  section: string;
  label: string;
  value: string;
  questionId: string;
  externalUrl?: string;
  fileId?: string;
}> {
  const sheet = answers[FORMGRID_SHEET_KEY];
  const sheetObj =
    sheet && typeof sheet === "object" && !Array.isArray(sheet)
      ? (sheet as Record<string, unknown>)
      : {};
  const storedFiles = readFormgridStoredFiles(answers);
  const formgridRows = orderedFormgridSheetKeys(sheetObj, answers).map(
    (key) => {
      const value = sheetObj[key];
      const text = clean(value);
      const stored = storedFiles[key];
      if (stored?.id) {
        return {
          section: "",
          label: key,
          value: stored.fileName,
          questionId: `${FORMGRID_SHEET_KEY}.${key}`,
          fileId: stored.id,
        };
      }
      const externalUrl = isExternalFileUrl(text) ? text : undefined;
      const displayText = externalUrl
        ? fileNameFromExternalUrl(text, key)
        : formatFormgridPersonNameValue(key, text);
      return {
        section: "",
        label: key,
        value: displayText,
        questionId: `${FORMGRID_SHEET_KEY}.${key}`,
        externalUrl,
      };
    },
  );

  const crmOps = readFormgridCrmOpsSheet(answers);
  const crmRows = buildManagerFillReviewRows(crmOps);

  return [...formgridRows, ...crmRows];
}

function sortFormgridSheetKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const na = a.match(/^(\d+)/);
    const nb = b.match(/^(\d+)/);
    if (na && nb) {
      const diff = Number(na[1]) - Number(nb[1]);
      if (diff !== 0) return diff;
      return a.localeCompare(b, "ru");
    }
    if (na && !nb) return -1;
    if (!na && nb) return 1;
    return a.localeCompare(b, "ru");
  });
}

function orderedFormgridSheetKeys(
  sheetObj: Record<string, unknown>,
  answers: Record<string, unknown>,
): string[] {
  const rawOrder = answers[FORMGRID_SHEET_ORDER_KEY];
  if (Array.isArray(rawOrder) && rawOrder.length > 0) {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const key of rawOrder) {
      if (typeof key !== "string" || !key || seen.has(key)) continue;
      if (!(key in sheetObj)) continue;
      seen.add(key);
      ordered.push(key);
    }
    const rest = Object.keys(sheetObj).filter((k) => !seen.has(k));
    return [...ordered, ...sortFormgridSheetKeys(rest)];
  }
  return sortFormgridSheetKeys(Object.keys(sheetObj));
}

function formatFormgridPersonNameValue(column: string, text: string): string {
  if (!text.trim()) return text;
  const k = column.toLowerCase();
  const looksNameCol = /фио|имя|name|фамилия|отец|мать|father|mother/.test(k);
  if (!looksNameCol) return text;
  if (/[а-яё]/i.test(text)) return formatCyrillicNameIof(text);
  if (/[a-z]/i.test(text)) return formatLatinNameIof(text);
  return text;
}

/** Staff-editable ops block shared by Formgrid + portal questionnaire cases. */
export function buildManagerFillReviewRows(
  crmOps: FormgridCrmOpsSheet = emptyFormgridCrmOpsSheet(),
): Array<{
  section: string;
  label: string;
  value: string;
  questionId: string;
}> {
  return FORMGRID_CRM_OPS_COLUMNS.map((key) => ({
    section: MANAGER_FILL_SECTION,
    label: key,
    value: crmOps[key],
    questionId: `${FORMGRID_CRM_OPS_KEY}.${key}`,
  }));
}

export function parseFormgridSubmittedAtIso(raw: string | null | undefined): string | null {
  const s = clean(raw);
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  // dd.mm.yyyy or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const iso = new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0),
    );
    if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  }
  return null;
}
