/**
 * Legacy CRM (Croatia External sheet) → client-portal questionnaire answers.
 * Pure module — no server-only / path aliases (usable from Node scripts).
 */

export const LEGACY_CRM_SOURCE = "croatia_external" as const;

export const LEGACY_IMPORT_KEY = "__import";
export const LEGACY_SHEET_KEY = "__legacySheet";
export const LEGACY_IDENTITY_KEY = "__identity";
export const LEGACY_STAFF_KEY = "__staff";
export const LEGACY_NOTES_KEY = "__staff_notes";

export type LegacyCrmIdentity = {
  fullNameCyrillic: string;
  fullNameLatin: string;
  passportNumber: string;
  email: string;
  submittedAt: string;
  status: string;
  direction: string;
};

export type LegacyCrmImportMeta = {
  source: typeof LEGACY_CRM_SOURCE;
  sheetRow: number | null;
  importedAt: string;
  fingerprint: string;
};

/** Row-shaped input from External sheet / Client model. */
export type LegacyCrmClientRow = {
  name: string;
  citizenship?: string;
  passportNumber?: string;
  email?: string;
  phone?: string;
  submittedAt?: string;
  expectedApprovalAt?: string;
  referentName?: string;
  manager?: string;
  bookingAddress?: string;
  bookingRange?: string;
  approvalAt?: string;
  notes?: string;
  residenceCardIssuedAt?: string;
  appPassword?: string;
  partnerName?: string;
  contract?: string;
  status?: string;
  direction?: string;
  country?: string;
  rowIndex?: number;
  /** Full header→value map when available */
  sheetColumns?: Record<string, string>;
};

/** Canonical External columns (password excluded from storage/UI). */
export const EXTERNAL_COLUMN_ORDER = [
  "Фамилия",
  "Латиница",
  "Номер паспорта",
  "электронная почта",
  "Дата подачи",
  "Дата предпологаемого одобрения",
  "Имя референта",
  "Адрес букинга",
  "Дата букинга (от и до)",
  "Дата одобрения ВНЖ",
  "Заметки",
  "Дата выдачи карточки ВНЖ",
  "Партнер от кого клиент",
  "Договор",
  "ТИП ЗАНЯТОСТИ",
  "СВИДЕТЕЛЬСТВО О РЕГИСТРАЦИИ КОМПАНИИ",
  "СПРАВКА О НЕСУДИМОСТИ",
  "ПОДПИСЬ КЛИЕНТА",
  "медстраховка",
] as const;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

/** Normalize sheet header for matching (collapse spaces, lower-case). */
export function normalizeSheetHeader(header: string): string {
  return clean(header).replace(/\s+/g, " ").toLowerCase();
}

export function isPasswordSheetHeader(header: string): boolean {
  return normalizeSheetHeader(header).includes("пароль");
}

/** Map messy sheet headers to canonical labels where possible. */
function canonicalHeader(header: string): string {
  const n = normalizeSheetHeader(header);
  if (!n) return clean(header);
  if (n.includes("дата букинга")) return "Дата букинга (от и до)";
  if (n.includes("предполог") && n.includes("одобрен")) {
    return "Дата предпологаемого одобрения";
  }
  if (n.includes("электронная почта") || n === "email" || n === "e-mail") {
    return "электронная почта";
  }
  if (n.includes("номер паспорта") || n === "паспорт") return "Номер паспорта";
  if (n === "фамилия") return "Фамилия";
  if (n === "латиница") return "Латиница";
  if (n === "дата подачи") return "Дата подачи";
  if (n === "имя референта") return "Имя референта";
  if (n === "адрес букинга") return "Адрес букинга";
  if (n.includes("дата одобрения внж")) return "Дата одобрения ВНЖ";
  if (n === "заметки") return "Заметки";
  if (n.includes("дата выдачи карточки")) return "Дата выдачи карточки ВНЖ";
  if (n.includes("партнер") || n.includes("портнер")) return "Партнер от кого клиент";
  if (n === "договор") return "Договор";
  if (n.includes("тип занятости")) return "ТИП ЗАНЯТОСТИ";
  if (n.includes("свидетельств") && n.includes("компани")) {
    return "СВИДЕТЕЛЬСТВО О РЕГИСТРАЦИИ КОМПАНИИ";
  }
  if (n.includes("несудимости")) return "СПРАВКА О НЕСУДИМОСТИ";
  if (n.includes("подпись")) return "ПОДПИСЬ КЛИЕНТА";
  if (n.includes("медстрах")) return "медстраховка";
  return clean(header).replace(/\s+/g, " ");
}

/** Stable short fingerprint for idempotent ids (no crypto dependency). */
export function legacyCrmFingerprint(row: LegacyCrmClientRow): string {
  const passport = clean(row.passportNumber).toLowerCase();
  const email = clean(row.email).toLowerCase();
  const name = clean(row.name).toLowerCase();
  const base =
    passport ||
    email ||
    `${name}|${row.rowIndex ?? ""}|${clean(row.submittedAt)}`;
  let hash = 2166136261;
  for (let i = 0; i < base.length; i++) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function legacyUserId(fingerprint: string): string {
  return `legacy-user-${fingerprint}`;
}

export function legacyQuestionnaireId(fingerprint: string): string {
  return `legacy-q-${fingerprint}`;
}

export function isLegacyCrmImport(
  answers: Record<string, unknown> | null | undefined,
): boolean {
  const meta = answers?.[LEGACY_IMPORT_KEY];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return (meta as { source?: string }).source === LEGACY_CRM_SOURCE;
}

export function readLegacyIdentity(
  answers: Record<string, unknown> | null | undefined,
): LegacyCrmIdentity | null {
  const raw = answers?.[LEGACY_IDENTITY_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  return {
    fullNameCyrillic: clean(obj.fullNameCyrillic),
    fullNameLatin: clean(obj.fullNameLatin),
    passportNumber: clean(obj.passportNumber),
    email: clean(obj.email),
    submittedAt: clean(obj.submittedAt),
    status: clean(obj.status),
    direction: clean(obj.direction),
  };
}

function buildSheetColumns(row: LegacyCrmClientRow): Record<string, string> {
  const out: Record<string, string> = {};

  if (row.sheetColumns && Object.keys(row.sheetColumns).length > 0) {
    for (const [key, value] of Object.entries(row.sheetColumns)) {
      if (isPasswordSheetHeader(key)) continue;
      const label = canonicalHeader(key);
      if (!label || isPasswordSheetHeader(label)) continue;
      out[label] = clean(value);
    }
  } else {
    Object.assign(out, {
      Фамилия: clean(row.name),
      Латиница: clean(row.citizenship),
      "Номер паспорта": clean(row.passportNumber),
      "электронная почта": clean(row.email),
      "Дата подачи": clean(row.submittedAt),
      "Дата предпологаемого одобрения": clean(row.expectedApprovalAt),
      "Имя референта": clean(row.referentName || row.manager),
      "Адрес букинга": clean(row.bookingAddress),
      "Дата букинга (от и до)": clean(row.bookingRange),
      "Дата одобрения ВНЖ": clean(row.approvalAt),
      Заметки: clean(row.notes),
      "Дата выдачи карточки ВНЖ": clean(row.residenceCardIssuedAt),
      "Партнер от кого клиент": clean(row.partnerName),
      Договор: clean(row.contract),
    });
  }

  // Ensure canonical order keys exist even if empty; never keep password.
  const ordered: Record<string, string> = {};
  for (const key of EXTERNAL_COLUMN_ORDER) {
    ordered[key] = out[key] ?? "";
  }
  for (const [key, value] of Object.entries(out)) {
    if (!(key in ordered) && !isPasswordSheetHeader(key)) {
      ordered[key] = value;
    }
  }
  return ordered;
}

export function buildLegacyAnswersFromClient(
  row: LegacyCrmClientRow,
  options?: { importedAt?: string; existingAnswers?: Record<string, unknown> },
): Record<string, unknown> {
  const importedAt = options?.importedAt ?? new Date().toISOString();
  const fingerprint = legacyCrmFingerprint(row);
  const sheetColumns = buildSheetColumns(row);
  const curator = clean(row.referentName || row.manager);
  const notes = clean(row.notes);

  const identity: LegacyCrmIdentity = {
    fullNameCyrillic: clean(row.name),
    fullNameLatin: clean(row.citizenship),
    passportNumber: clean(row.passportNumber),
    email: clean(row.email),
    submittedAt: clean(row.submittedAt),
    status: clean(row.status),
    direction: clean(row.direction || row.country) || "Хорватия",
  };

  const staff = {
    // Legacy sheet "Договор" is not a contract number — keep list column empty.
    contractNumber: "",
    contractAmount: "",
    company: "",
    curator,
    expectedApproval: clean(row.expectedApprovalAt),
    bookingAddress: clean(row.bookingAddress),
    bookingDate: clean(row.bookingRange),
    trpApprovalDate: clean(row.approvalAt),
    trpCardIssueDate: clean(row.residenceCardIssuedAt),
    partner: clean(row.partnerName),
  };

  const importMeta: LegacyCrmImportMeta = {
    source: LEGACY_CRM_SOURCE,
    sheetRow: row.rowIndex ?? null,
    importedAt,
    fingerprint,
  };

  const existing = options?.existingAnswers ?? {};
  const existingNotes = Array.isArray(existing[LEGACY_NOTES_KEY])
    ? (existing[LEGACY_NOTES_KEY] as unknown[])
    : [];

  let staffNotes = existingNotes;
  if (notes) {
    const alreadyHasImportNote = existingNotes.some((item) => {
      if (!item || typeof item !== "object") return false;
      const text = clean((item as { text?: unknown }).text);
      return text === notes || text.startsWith("[Импорт CRM]");
    });
    if (!alreadyHasImportNote) {
      staffNotes = [
        ...existingNotes,
        {
          id: `legacy-note-${fingerprint}`,
          text: notes,
          authorName: "Импорт CRM",
          authorUserId: "system-legacy-import",
          createdAt: importedAt,
        },
      ];
    }
  }

  return {
    ...existing,
    // Identity mirrors common portal question ids used in intake list
    full_name_cyrillic: identity.fullNameCyrillic,
    full_name_latin: identity.fullNameLatin,
    [LEGACY_IDENTITY_KEY]: identity,
    [LEGACY_SHEET_KEY]: sheetColumns,
    [LEGACY_STAFF_KEY]: staff,
    [LEGACY_IMPORT_KEY]: importMeta,
    [LEGACY_NOTES_KEY]: staffNotes,
  };
}

export function buildLegacyReviewRows(
  answers: Record<string, unknown>,
  _locale: "ru" | "en" = "ru",
): Array<{
  section: string;
  label: string;
  value: string;
  questionId: string;
}> {
  const rows: Array<{
    section: string;
    label: string;
    value: string;
    questionId: string;
  }> = [];

  const sheet = answers[LEGACY_SHEET_KEY];
  const sheetObj =
    sheet && typeof sheet === "object" && !Array.isArray(sheet)
      ? (sheet as Record<string, unknown>)
      : {};

  const orderedKeys = [
    ...EXTERNAL_COLUMN_ORDER,
    ...Object.keys(sheetObj).filter(
      (k) => !(EXTERNAL_COLUMN_ORDER as readonly string[]).includes(k),
    ),
  ];
  const seen = new Set<string>();
  for (const key of orderedKeys) {
    if (seen.has(key) || isPasswordSheetHeader(key)) continue;
    seen.add(key);
    const value = clean(sheetObj[key]);
    rows.push({
      section: "",
      label: key,
      value,
      questionId: `${LEGACY_SHEET_KEY}.${key}`,
    });
  }

  return rows;
}

/**
 * Apply staff edits to `__legacySheet` and keep identity / staff mirrors in sync.
 * Keys are sheet column labels (Фамилия, …). Password columns are ignored.
 */
export function applyLegacySheetEdits(
  answers: Record<string, unknown>,
  fields: Record<string, string>,
): Record<string, unknown> {
  const currentSheet =
    answers[LEGACY_SHEET_KEY] &&
    typeof answers[LEGACY_SHEET_KEY] === "object" &&
    !Array.isArray(answers[LEGACY_SHEET_KEY])
      ? { ...(answers[LEGACY_SHEET_KEY] as Record<string, string>) }
      : {};

  for (const [rawKey, rawValue] of Object.entries(fields)) {
    const key = canonicalHeader(rawKey);
    if (!key || isPasswordSheetHeader(key)) continue;
    currentSheet[key] = clean(rawValue);
  }

  // Ensure canonical keys exist
  for (const key of EXTERNAL_COLUMN_ORDER) {
    if (!(key in currentSheet)) currentSheet[key] = "";
  }

  const fullName = clean(currentSheet["Фамилия"]);
  const latin = clean(currentSheet["Латиница"]);
  const email = clean(currentSheet["электронная почта"]);
  const passport = clean(currentSheet["Номер паспорта"]);
  const submittedAt = clean(currentSheet["Дата подачи"]);

  const identity: LegacyCrmIdentity = {
    fullNameCyrillic: fullName,
    fullNameLatin: latin,
    passportNumber: passport,
    email,
    submittedAt,
    status: clean(
      (answers[LEGACY_IDENTITY_KEY] as LegacyCrmIdentity | undefined)?.status,
    ),
    direction:
      clean(
        (answers[LEGACY_IDENTITY_KEY] as LegacyCrmIdentity | undefined)
          ?.direction,
      ) || "Хорватия",
  };

  const existingStaff =
    answers[LEGACY_STAFF_KEY] &&
    typeof answers[LEGACY_STAFF_KEY] === "object" &&
    !Array.isArray(answers[LEGACY_STAFF_KEY])
      ? (answers[LEGACY_STAFF_KEY] as Record<string, string>)
      : {};

  const staff = {
    ...existingStaff,
    contractNumber: clean(existingStaff.contractNumber),
    contractAmount: clean(existingStaff.contractAmount),
    company: clean(existingStaff.company),
    curator: clean(currentSheet["Имя референта"]),
    expectedApproval: clean(currentSheet["Дата предпологаемого одобрения"]),
    bookingAddress: clean(currentSheet["Адрес букинга"]),
    bookingDate: clean(currentSheet["Дата букинга (от и до)"]),
    trpApprovalDate: clean(currentSheet["Дата одобрения ВНЖ"]),
    trpCardIssueDate: clean(currentSheet["Дата выдачи карточки ВНЖ"]),
    partner: clean(currentSheet["Партнер от кого клиент"]),
  };

  return {
    ...answers,
    full_name_cyrillic: fullName,
    full_name_latin: latin,
    [LEGACY_IDENTITY_KEY]: identity,
    [LEGACY_SHEET_KEY]: currentSheet,
    [LEGACY_STAFF_KEY]: staff,
  };
}

export function parseSubmittedAtIso(value: string | undefined): string | null {
  const raw = clean(value);
  if (!raw || raw === "—") return null;
  // DD.MM.YYYY
  const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T12:00:00.000Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
