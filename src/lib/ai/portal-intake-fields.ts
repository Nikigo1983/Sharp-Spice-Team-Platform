/**
 * Pure field readers for Emigrant portal intake answers (no server-only deps).
 * Builds a full per-question field card for AI Workspace.
 */
import {
  EXTERNAL_COLUMN_ORDER,
  readLegacyIdentity,
} from "@/lib/client-portal/legacy-crm";
import { SHARP_SPICE_ONBOARDING_SCHEMA } from "@/lib/client-portal/questionnaire-schema";
import {
  isFileAnswer,
  pickLabel,
} from "@/lib/client-portal/questionnaire-types";
import { readProcessStatus } from "@/lib/client-portal/process-status";
import { readStaffFields } from "@/lib/client-portal/staff-fields";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export type PortalIntakeFieldRow = {
  id?: string;
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

/** Contract type/name — not the money amount (see finance / Сумма договора). */
export function answerContractFromAnswers(
  answers: Record<string, unknown>,
): string {
  const staff = readStaffFields(answers);
  return (
    clean(staff.contractNumber) ||
    readSheetColumnFromAnswers(answers, "Договор", "Contract") ||
    clean(staff.company)
  );
}

/** Staff-field contract amount text (may be empty; Finance is source of truth for €). */
export function answerStaffContractAmountFromAnswers(
  answers: Record<string, unknown>,
): string {
  return clean(readStaffFields(answers).contractAmount);
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

export function answerPlaceOfBirthFromAnswers(
  answers: Record<string, unknown>,
): string {
  return (
    clean(answers.place_of_birth_latin) ||
    readSheetColumnFromAnswers(
      answers,
      "Место рождения",
      "Place of birth",
      "Место рождения (латинскими)",
    )
  );
}

function formatAnswerValue(raw: unknown, type?: string): string {
  if (raw == null) return "";
  if (type === "yes_no") {
    if (raw === "yes" || raw === true) return "Да";
    if (raw === "no" || raw === false) return "Нет";
  }
  if (type === "boolean") {
    if (raw === true) return "Да";
    if (raw === false) return "Нет";
  }
  if (type === "file" && isFileAnswer(raw)) {
    return `${raw.fileName} (${Math.round(raw.sizeBytes / 1024)} KB)`;
  }
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  return "";
}

function shortRuLabel(label: string): string {
  return label.replace(/^\d+\.\s*/, "").trim();
}

/** Stable AI-facing labels — avoid confusing parentheticals like «в стране гражданства». */
const AI_FIELD_LABEL_BY_ID: Record<string, string> = {
  full_name_cyrillic: "ФИО (кириллицей)",
  full_name_latin: "ФИО (латиницей)",
  birth_surname_latin: "Фамилия при рождении",
  date_of_birth: "Дата рождения",
  place_of_birth_latin: "Место рождения",
  residence_address_latin: "Адрес проживания (страна гражданства)",
  phone: "Контактный телефон",
  contact_email: "Электронная почта",
  passport_number: "Номер загранпаспорта",
  passport_issued_by: "Орган, выдавший паспорт",
  passport_issue_date: "Дата выдачи паспорта",
  passport_expiry_date: "Дата окончания паспорта",
  education_specialty_latin: "Образование / специальность",
  citizenship_latin: "Гражданство",
  nationality_latin: "Национальность",
  marital_status_latin: "Семейное положение",
  father_name_latin: "Отец: ФИО",
  mother_name_latin: "Мать: ФИО",
};

function aiLabelForQuestion(questionId: string, fallbackLabel: string): string {
  return AI_FIELD_LABEL_BY_ID[questionId] ?? shortRuLabel(fallbackLabel);
}

function pushUnique(
  rows: PortalIntakeFieldRow[],
  seen: Set<string>,
  row: PortalIntakeFieldRow,
): void {
  const key = row.label.toLowerCase();
  if (seen.has(key)) {
    const existing = rows.find((r) => r.label.toLowerCase() === key);
    if (existing?.empty && !row.empty) {
      existing.value = row.value;
      existing.empty = false;
      if (row.id) existing.id = row.id;
    }
    return;
  }
  seen.add(key);
  rows.push(row);
}

/**
 * Full questionnaire field card — one row per UI / schema position.
 * Empty values are kept so the model can say «не заполнено» without inventing.
 */
export function buildPortalIntakeFieldCard(
  answers: Record<string, unknown>,
  options?: { recordStatus?: string; submittedAtFallback?: string | null },
): PortalIntakeFieldRow[] {
  const staff = readStaffFields(answers);
  const process = readProcessStatus(answers, options?.recordStatus);
  const identity = readLegacyIdentity(answers);
  const rows: PortalIntakeFieldRow[] = [];
  const seen = new Set<string>();

  const byLabel = (
    label: string,
    value: string,
    id?: string,
  ): PortalIntakeFieldRow => {
    const v = clean(value);
    return { id, label, value: v, empty: !v };
  };

  // 1) Full onboarding questionnaire (portal form positions).
  for (const section of SHARP_SPICE_ONBOARDING_SCHEMA.sections) {
    for (const question of section.questions) {
      if (question.type === "information") continue;
      const label = aiLabelForQuestion(
        question.id,
        pickLabel(question.label, "ru"),
      );
      let value = formatAnswerValue(answers[question.id], question.type);

      // Legacy / staff fallbacks for common identity fields.
      if (!value) {
        if (question.id === "full_name_cyrillic") {
          value =
            clean(identity?.fullNameCyrillic) ||
            readSheetColumnFromAnswers(answers, "Фамилия");
        } else if (question.id === "full_name_latin") {
          value = answerLatinNameFromAnswers(answers);
        } else if (question.id === "passport_number") {
          value = answerPassportFromAnswers(answers);
        } else if (question.id === "contact_email") {
          value = clean(identity?.email) || clean(answers.contact_email);
        } else if (question.id === "place_of_birth_latin") {
          value = answerPlaceOfBirthFromAnswers(answers);
        } else if (question.id === "citizenship_latin") {
          value = answerCitizenshipFromAnswers(answers);
        } else if (question.id === "phone") {
          value =
            clean(answers.phone) ||
            clean(answers.contact_phone) ||
            readSheetColumnFromAnswers(answers, "Телефон", "Phone");
        }
      }

      pushUnique(rows, seen, byLabel(label, value, question.id));
    }
  }

  // 2) Legacy sheet / staff CRM columns (portal intake UI for imported cases).
  for (const label of EXTERNAL_COLUMN_ORDER) {
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
      }
    }
    pushUnique(rows, seen, byLabel(label, value));
  }

  // 3) Remaining legacy/formgrid sheet keys not already covered.
  for (const sheetKey of ["__legacySheet", "__formgridSheet"] as const) {
    const sheet = answers[sheetKey];
    if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) continue;
    for (const [key, raw] of Object.entries(sheet as Record<string, unknown>)) {
      if (/пароль|password/i.test(key)) continue;
      const value = clean(raw);
      if (!value || value.length > 500) continue;
      pushUnique(rows, seen, byLabel(key, value));
    }
  }

  // 4) Process / staff extras (skip Гражданство/Место рождения — already from schema).
  for (const row of [
    byLabel("Статус процесса", process?.value || ""),
    byLabel("Куратор", staff.curator),
    byLabel("Компания", staff.company),
    byLabel("Сумма договора (staff)", answerStaffContractAmountFromAnswers(answers)),
  ]) {
    pushUnique(rows, seen, row);
  }

  return rows;
}

export function formatPortalIntakeFieldCardText(
  rows: PortalIntakeFieldRow[],
): string {
  const lines = [
    "ПОЛЯ ЗАЯВКИ ПОРТАЛА (по позициям анкеты — авторитетный источник):",
    ...rows.map((row) =>
      row.empty
        ? `- ${row.label}: [не заполнено]`
        : `- ${row.label}: ${row.value}`,
    ),
  ];
  return lines.join("\n");
}

/** Prompt dictionary: how the model must interpret each client detail. */
export const PORTAL_INTAKE_FIELD_PROMPT = `
Словарь полей заявки портала Emigrant (обязательно читать блок «ПОЛЯ ЗАЯВКИ ПОРТАЛА» / fields[]):

Личные данные:
- ФИО (кириллицей) / Фамилия — кириллическое ФИО. Не путать с латиницей.
- ФИО (латиницей) / Латиница — ФИО латиницей как в загранпаспорте. Это НЕ гражданство и НЕ место рождения.
- Фамилия при рождении — девичья/прежняя фамилия, не место рождения.
- Дата рождения — дата рождения клиента.
- Место рождения — город/страна рождения. Если value есть — назови его; не говори «не удалось подтвердить».
- Адрес проживания (страна гражданства) — это АДРЕС дома. НЕ гражданство. Не называй это поле «Гражданство» и не пиши «расхождение» с гражданством.
- Контактный телефон — телефон клиента.
- Электронная почта — email.
- Номер загранпаспорта — номер паспорта. Заполненное значение нельзя называть «не получен».
- Орган, выдавший паспорт / Дата выдачи паспорта / Дата окончания паспорта — реквизиты паспорта.
- Образование / специальность — образование.
- Гражданство — только страна/гражданство (например Russian Federation). Никогда не подставляй Латиницу или адрес.
- Национальность — национальность (не путать с гражданством и адресом).
- Семейное положение — marital status.
- Отец: ФИО / Мать: ФИО — родители.

Вопросы по Хорватии:
- Почему вы выбрали именно Хорватию…
- Как вы узнали о программе…
- Был ли у вас … ВНЖ в Хорватии / в другой стране — Да/Нет.
- Чем именно вы занимаетесь… — опыт работы.
- Бывали ли вы в Хорватии раньше — Да/Нет.
- В каких странах вы были… — travel history.

Документы / статусы вложений:
- Загранпаспорт (PDF) / Справка о несудимости / ВНЖ другой страны / Банковская выписка / Контракт — имя файла или [не заполнено].
- У вас есть справка/выписка/контракт — Да/Нет.

Операционные поля кейса (staff / legacy):
- Дата подачи, Дата предпологаемого одобрения, Имя референта / Куратор.
- Адрес букинга, Дата букинга (от и до).
- Дата одобрения ВНЖ, Дата выдачи карточки ВНЖ.
- Договор — тип/название договора или контрагента (например Flant JSC), НЕ денежная сумма.
- Сумма договора — денежная сумма из Finance (€). Для списков сумм по всем клиентам используй инструмент list_client_contracts. Если суммы нет — «пока нет договора» (не оговаривай, что пустое ≠ отсутствие).
- СВИДЕТЕЛЬСТВО О РЕГИСТРАЦИИ КОМПАНИИ / СПРАВКА О НЕСУДИМОСТИ / ПОДПИСЬ КЛИЕНТА / медстраховка.
- Статус процесса, Компания.

Правила ответа:
1. Для любого факта о клиенте сначала найди строку в «ПОЛЯ ЗАЯВКИ ПОРТАЛА» / fields[].
2. Если value есть — ответь этим значением и укажи «из заявки портала Emigrant».
3. Если стоит [не заполнено] / empty=true — скажи, что в заявке поле пустое. Не выдумывай.
4. Не называй заполненное поле отсутствующим.
5. Не путай: Латиница ≠ Гражданство ≠ Место рождения ≠ Фамилия при рождении ≠ Адрес проживания.
6. Запрос «какое гражданство» = только поле «Гражданство». Адрес проживания — не гражданство и не конфликт.
7. Запрос «какое место рождения» = только поле «Место рождения».
8. Не выдумывай «расхождения» между разными полями, если они про разное (гражданство vs адрес).
9. Запрос «суммы договоров по всем клиентам» — вызови list_client_contracts. Не проси менеджера прислать выгрузку, если инструмент доступен.
10. contractAmount «пока нет договора» / null → ответь «пока нет договора». Не пиши, что пустое значение не означает отсутствие договора.
11. «Кто должник по оплате» — Finance (баланс > 0 / onlyWithDebt), не статус заявки портала.
`.trim();
