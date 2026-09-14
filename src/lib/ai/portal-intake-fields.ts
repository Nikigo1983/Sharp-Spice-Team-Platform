/**
 * Pure field readers for Emigrant portal intake answers (no server-only deps).
 * Maps questionnaire / legacy sheet columns for AI Workspace.
 */
import {
  EXTERNAL_COLUMN_ORDER,
  readLegacyIdentity,
} from "@/lib/client-portal/legacy-crm";
import { readStaffFields } from "@/lib/client-portal/staff-fields";
import { readProcessStatus } from "@/lib/client-portal/process-status";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export type PortalIntakeFieldRow = {
  label: string;
  value: string;
  empty: boolean;
};

export function readSheetColumnFromAnswers(
  answers: Record<string, unknown>,
  ...labels: string[]
): string {
  const sheets = [answers.__legacySheet, answers.__formgridSheet];
  const wanted = labels.map((label) => label.trim().toLowerCase());
  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) continue;
    const obj = sheet as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (!wanted.includes(key.trim().toLowerCase())) continue;
      const v = clean(value);
      if (v) return v;
    }
  }
  return "";
}

export function answerLatinNameFromAnswers(
  answers: Record<string, unknown>,
): string {
  const identity = readLegacyIdentity(answers);
  if (identity?.fullNameLatin) return identity.fullNameLatin;
  return (
    clean(answers.full_name_latin) ||
    readSheetColumnFromAnswers(answers, "Латиница", "Latin")
  );
}

/** Real citizenship/nationality — never the «Латиница» FIO column. */
export function answerCitizenshipFromAnswers(
  answers: Record<string, unknown>,
): string {
  const latin = answerLatinNameFromAnswers(answers).toLowerCase();
  const candidates = [
    clean(answers.citizenship_latin),
    clean(answers.nationality_latin),
    readSheetColumnFromAnswers(
      answers,
      "Гражданство",
      "Citizenship",
      "Национальность",
    ),
  ];
  for (const value of candidates) {
    if (!value) continue;
    if (latin && value.toLowerCase() === latin) continue;
    return value;
  }
  return "";
}

/** Contract label from staff fields or legacy/Formgrid «Договор» column. */
export function answerContractFromAnswers(
  answers: Record<string, unknown>,
): string {
  const staff = readStaffFields(answers);
  return (
    clean(staff.contractNumber) ||
    clean(staff.contractAmount) ||
    readSheetColumnFromAnswers(answers, "Договор", "Contract") ||
    clean(staff.company)
  );
}

/** Passport number from identity, answers, or sheet «Номер паспорта». */
export function answerPassportFromAnswers(
  answers: Record<string, unknown>,
): string {
  const identity = readLegacyIdentity(answers);
  if (identity?.passportNumber) return identity.passportNumber;
  for (const key of [
    "passport_number",
    "passport",
    "zagran_passport_number",
  ]) {
    const v = clean(answers[key]);
    if (v) return v;
  }
  const fromSheet = readSheetColumnFromAnswers(
    answers,
    "Номер паспорта",
    "Паспорт",
    "Passport",
  );
  if (fromSheet && !/^https?:\/\//i.test(fromSheet)) return fromSheet;
  return "";
}

export function answerSubmittedAtFromAnswers(
  answers: Record<string, unknown>,
  fallbackIso?: string | null,
): string {
  return (
    readSheetColumnFromAnswers(answers, "Дата подачи") ||
    clean(readLegacyIdentity(answers)?.submittedAt) ||
    clean(fallbackIso)
  );
}

/**
 * Full questionnaire field card — one row per UI position.
 * Empty values are kept so the model can say «не заполнено» without inventing.
 */
export function buildPortalIntakeFieldCard(
  answers: Record<string, unknown>,
  options?: { recordStatus?: string; submittedAtFallback?: string | null },
): PortalIntakeFieldRow[] {
  const staff = readStaffFields(answers);
  const process = readProcessStatus(answers, options?.recordStatus);
  const identity = readLegacyIdentity(answers);

  const byLabel = (label: string, value: string): PortalIntakeFieldRow => {
    const v = clean(value);
    return { label, value: v, empty: !v };
  };

  const sheetRows: PortalIntakeFieldRow[] = EXTERNAL_COLUMN_ORDER.map((label) => {
    let value = readSheetColumnFromAnswers(answers, label);
    if (!value) {
      if (label === "Фамилия") {
        value =
          clean(identity?.fullNameCyrillic) ||
          clean(answers.full_name_cyrillic);
      } else if (label === "Латиница") {
        value = answerLatinNameFromAnswers(answers);
      } else if (label === "Номер паспорта") {
        value = answerPassportFromAnswers(answers);
      } else if (label === "электронная почта") {
        value = clean(identity?.email) || clean(answers.contact_email);
      } else if (label === "Дата подачи") {
        value = answerSubmittedAtFromAnswers(
          answers,
          options?.submittedAtFallback,
        );
      } else if (label === "Дата предпологаемого одобрения") {
        value = clean(staff.expectedApproval);
      } else if (label === "Имя референта") {
        value = clean(staff.curator);
      } else if (label === "Адрес букинга") {
        value = clean(staff.bookingAddress);
      } else if (label === "Дата букинга (от и до)") {
        value = clean(staff.bookingDate);
      } else if (label === "Дата одобрения ВНЖ") {
        value = clean(staff.trpApprovalDate);
      } else if (label === "Дата выдачи карточки ВНЖ") {
        value = clean(staff.trpCardIssueDate);
      } else if (label === "Партнер от кого клиент") {
        value = clean(staff.partner);
      } else if (label === "Договор") {
        value = answerContractFromAnswers(answers);
      } else if (label === "Заметки") {
        value = readSheetColumnFromAnswers(answers, "Заметки");
      }
    }
    return byLabel(label, value);
  });

  const extras: PortalIntakeFieldRow[] = [
    byLabel("Гражданство", answerCitizenshipFromAnswers(answers)),
    byLabel("Статус процесса", process?.value || ""),
    byLabel("Куратор", staff.curator),
    byLabel("Компания", staff.company),
  ];

  const seen = new Set(sheetRows.map((row) => row.label.toLowerCase()));
  for (const row of extras) {
    if (seen.has(row.label.toLowerCase())) continue;
    sheetRows.push(row);
  }
  return sheetRows;
}

export function formatPortalIntakeFieldCardText(
  rows: PortalIntakeFieldRow[],
): string {
  const lines = [
    "ПОЛЯ ЗАЯВКИ ПОРТАЛА (по позициям анкеты):",
    ...rows.map((row) =>
      row.empty
        ? `- ${row.label}: [не заполнено]`
        : `- ${row.label}: ${row.value}`,
    ),
  ];
  return lines.join("\n");
}

/** Prompt dictionary: how the model must interpret each UI column. */
export const PORTAL_INTAKE_FIELD_PROMPT = `
Словарь полей заявки портала Emigrant (обязательно):
- Фамилия / ФИО — кириллическое имя клиента. Не путать с латиницей.
- Латиница — ФИО латиницей (как в загранпаспорте). Это НЕ гражданство и НЕ страна.
- Номер паспорта — номер документа. Если в полях заявки есть значение — ОБЯЗАТЕЛЬНО используй его; не говори «не получен», пока в карточке полей стоит [не заполнено].
- электронная почта — email клиента.
- Дата подачи — дата подачи заявки/кейса.
- Дата предпологаемого одобрения — ожидаемый период/дата одобрения (может быть диапазоном).
- Имя референта / Куратор — ответственный менеджер.
- Адрес букинга — адрес бронирования/проживания.
- Дата букинга (от и до) — период букинга (год может отсутствовать).
- Дата одобрения ВНЖ — фактическая дата одобрения; пусто ≠ «отказано».
- Дата выдачи карточки ВНЖ — дата выдачи карты; пусто ≠ отсутствие права.
- Заметки — свободные заметки по делу.
- Партнер от кого клиент — партнёр/источник лида.
- Договор — тип/название договора или контрагента (например Flant JSC), не обязательно номер.
- ТИП ЗАНЯТОСТИ — занятость (фриланс и т.п.).
- СВИДЕТЕЛЬСТВО О РЕГИСТРАЦИИ КОМПАНИИ / СПРАВКА О НЕСУДИМОСТИ / ПОДПИСЬ КЛИЕНТА / медстраховка — статусы/значения этих позиций анкеты.
- Гражданство — только реальное гражданство/национальность. Никогда не подставляй «Латиница».
- Статус процесса — этап дела в портале.

Правила ответа по карточке полей:
1. Опирайся на блок «ПОЛЯ ЗАЯВКИ ПОРТАЛА» / fields[] / CLIENT CONTEXT.
2. Для каждой упомянутой позиции: либо точное значение, либо явно «не заполнено».
3. Не называй заполненное поле отсутствующим.
4. Не путай Латиница ↔ Гражданство, Договор ↔ компания работодателя без данных.
`.trim();
