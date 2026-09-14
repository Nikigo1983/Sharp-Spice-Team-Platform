/**
 * AI Workspace adapter: Заявки клиентского портала Emigrant
 * (listSubmittedForStaff / client_portal_questionnaires).
 * Replaces Google Sheets «Клиенты» + Formgrid as the client source of truth.
 */
import "server-only";

import type { ClientContext } from "@/lib/ai/client-context";
import type { SearchField } from "@/lib/ai/client-search";
import { buildNormalizedNameFields } from "@/lib/ai/client-search";
import {
  formatStatusForAiContext,
  logClientStatusDebug,
} from "@/lib/ai/client-status";
import { isCaseArchived } from "@/lib/client-portal/case-archive";
import { resolveIntakeClientSource } from "@/lib/client-portal/client-source";
import {
  displayNameFromFormgridAnswers,
  isFormgridImport,
} from "@/lib/client-portal/formgrid-import";
import {
  isLegacyCrmImport,
  readLegacyIdentity,
} from "@/lib/client-portal/legacy-crm";
import { readProcessStatus } from "@/lib/client-portal/process-status";
import {
  getSubmittedForStaff,
  listSubmittedForStaff,
} from "@/lib/client-portal/questionnaire-service";
import type { QuestionnaireRecord } from "@/lib/client-portal/questionnaire-types";
import { readStaffFields } from "@/lib/client-portal/staff-fields";
import { readStaffNotes } from "@/lib/client-portal/staff-case-meta";
import {
  answerCitizenshipFromAnswers,
  answerContractFromAnswers,
  answerLatinNameFromAnswers,
  answerPassportFromAnswers,
  answerPlaceOfBirthFromAnswers,
  answerSubmittedAtFromAnswers,
  buildPortalIntakeFieldCard,
  formatPortalIntakeFieldCardText,
} from "@/lib/ai/portal-intake-fields";

export const PORTAL_INTAKE_SOURCE_LABEL = "Заявки портала Emigrant";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function portalIntakeDisplayName(record: QuestionnaireRecord): string {
  const identity = readLegacyIdentity(record.answers);
  if (identity?.fullNameCyrillic) return identity.fullNameCyrillic;
  if (identity?.fullNameLatin) return identity.fullNameLatin;
  if (isFormgridImport(record.answers)) {
    const fromFormgrid = displayNameFromFormgridAnswers(record.answers);
    if (fromFormgrid && fromFormgrid !== "Formgrid lead") return fromFormgrid;
  }
  const cyrillic = clean(record.answers.full_name_cyrillic);
  if (cyrillic) return cyrillic;
  const latin = clean(record.answers.full_name_latin);
  if (latin) return latin;
  const sheet = record.answers.__legacySheet;
  if (sheet && typeof sheet === "object" && !Array.isArray(sheet)) {
    const fio = clean((sheet as Record<string, unknown>)["ФИО"]);
    if (fio) return fio;
  }
  const composed = [record.firstName, clean(record.answers.last_name)]
    .filter(Boolean)
    .join(" ")
    .trim();
  return composed || record.email;
}

function answerPhone(record: QuestionnaireRecord): string {
  const identityKeys = [
    "phone",
    "contact_phone",
    "телефон",
    "phone_number",
  ];
  for (const key of identityKeys) {
    const v = clean(record.answers[key]);
    if (v) return v;
  }
  const sheet =
    record.answers.__legacySheet || record.answers.__formgridSheet;
  if (sheet && typeof sheet === "object" && !Array.isArray(sheet)) {
    for (const [key, value] of Object.entries(sheet as Record<string, unknown>)) {
      if (/телефон|phone|whatsapp/i.test(key)) {
        const v = clean(value);
        if (v) return v;
      }
    }
  }
  return "";
}

function answerPassport(record: QuestionnaireRecord): string {
  return answerPassportFromAnswers(record.answers);
}

function answerLatinName(record: QuestionnaireRecord): string {
  return answerLatinNameFromAnswers(record.answers);
}

/** Real citizenship/nationality — never the «Латиница» FIO column. */
export function answerCitizenship(record: QuestionnaireRecord): string {
  return answerCitizenshipFromAnswers(record.answers);
}

/** Contract label from staff fields or legacy/Formgrid «Договор» column. */
export function answerContract(record: QuestionnaireRecord): string {
  return answerContractFromAnswers(record.answers);
}

function answerEmail(record: QuestionnaireRecord): string {
  const identity = readLegacyIdentity(record.answers);
  if (identity?.email) return identity.email;
  const contact = clean(record.answers.contact_email);
  if (contact) return contact;
  return record.email;
}

function answerNotes(record: QuestionnaireRecord): string {
  const staffNotes = readStaffNotes(record.answers);
  const staffText = staffNotes
    .map((n) => clean(n.text))
    .filter(Boolean)
    .join(" | ");
  const sheet = record.answers.__legacySheet;
  let legacyNote = "";
  if (sheet && typeof sheet === "object" && !Array.isArray(sheet)) {
    legacyNote = clean((sheet as Record<string, unknown>)["Заметки"]);
  }
  return [staffText, legacyNote].filter(Boolean).join(" | ");
}

function answerDirection(record: QuestionnaireRecord): string {
  const identity = readLegacyIdentity(record.answers);
  return identity?.direction || clean(record.answers.direction) || "Хорватия";
}

function buildSurveyText(record: QuestionnaireRecord): string {
  return formatPortalIntakeFieldCardText(
    buildPortalIntakeFieldCard(record.answers, {
      recordStatus: record.status,
      submittedAtFallback: record.submittedAt,
    }),
  );
}

export function portalCaseToSearchFields(
  record: QuestionnaireRecord,
): SearchField[] {
  const fields: SearchField[] = [];
  const push = (
    label: string,
    value: string | undefined,
    category: SearchField["category"],
  ) => {
    const v = value?.trim();
    if (!v || v === "—") return;
    fields.push({ label, value: v, category });
  };

  const name = portalIntakeDisplayName(record);
  const latin = answerLatinName(record);
  const staff = readStaffFields(record.answers);
  const process = readProcessStatus(record.answers, record.status);

  push("ФИО / фамилия", name, "name");
  fields.push(...buildNormalizedNameFields(name));
  if (latin) {
    push("латиница", latin, "name");
    push("ФИО (латиница)", latin, "name");
    fields.push(...buildNormalizedNameFields(latin));
  }
  push("телефон", answerPhone(record), "phone");
  push("email", answerEmail(record), "email");
  push("паспорт", answerPassport(record), "other");
  push("менеджер", staff.curator, "other");
  push("партнер от кого клиент", staff.partner, "other");
  push("договор", answerContract(record), "other");
  push("гражданство", answerCitizenship(record), "other");
  push(
    "место рождения",
    answerPlaceOfBirthFromAnswers(record.answers),
    "other",
  );
  push("адрес букинга", staff.bookingAddress, "other");
  push("даты букинга", staff.bookingDate, "other");
  push("статус", process?.value, "other");
  push("заметки", answerNotes(record), "notes");
  push("направление", answerDirection(record), "other");
  push("страна", "Хорватия", "other");
  push("дата подачи", record.submittedAt ?? undefined, "other");
  push("компания", staff.company, "other");

  const sheet =
    record.answers.__legacySheet || record.answers.__formgridSheet;
  if (sheet && typeof sheet === "object" && !Array.isArray(sheet)) {
    for (const [key, value] of Object.entries(sheet as Record<string, unknown>)) {
      const v = clean(value);
      if (!v || v.length > 300) continue;
      let category: SearchField["category"] = "other";
      if (/фио|name|имя|фамил/i.test(key)) category = "name";
      else if (/телефон|phone/i.test(key)) category = "phone";
      else if (/email|почта|mail/i.test(key)) category = "email";
      else if (/замет|коммент|note/i.test(key)) category = "notes";
      push(key.slice(0, 80), v, category);
    }
  }

  return fields;
}

export function portalCaseToContext(
  record: QuestionnaireRecord,
  score: number,
  matchedFields: string[] = [],
): ClientContext {
  const staff = readStaffFields(record.answers);
  const process = readProcessStatus(record.answers, record.status);
  const rawStatus = process?.value || "";
  const finalStatus = formatStatusForAiContext(rawStatus, "clients");
  const name = portalIntakeDisplayName(record);
  const sourceTag = resolveIntakeClientSource(record.answers);

  logClientStatusDebug({
    name,
    source: PORTAL_INTAKE_SOURCE_LABEL,
    rawStatus,
    finalStatus,
  });

  return {
    source: "clients",
    sourceLabel: PORTAL_INTAKE_SOURCE_LABEL,
    rowIndex: 0,
    name,
    phone: answerPhone(record),
    email: answerEmail(record),
    country: "Хорватия",
    direction: answerDirection(record),
    status: finalStatus,
    manager: staff.curator,
    lastActivity: record.submittedAt || record.updatedAt || "",
    surveyData: buildSurveyText(record),
    score,
    matchedFields,
    debugRow: {
      id: record.id,
      name,
      latinName: answerLatinName(record),
      citizenship: answerCitizenship(record),
      placeOfBirth: answerPlaceOfBirthFromAnswers(record.answers),
      partner: staff.partner,
      contract: answerContract(record),
      passport: answerPassport(record),
      submittedAt: answerSubmittedAtFromAnswers(
        record.answers,
        record.submittedAt,
      ),
      expectedApprovalAt:
        staff.expectedApproval ||
        clean(
          (record.answers.__legacySheet as Record<string, string> | undefined)?.[
            "Дата предпологаемого одобрения"
          ],
        ),
      referentName: staff.curator,
      bookingAddress: staff.bookingAddress,
      bookingRange: staff.bookingDate,
      approvalAt: staff.trpApprovalDate,
      notes: answerNotes(record),
      residenceCardIssuedAt: staff.trpCardIssueDate,
      manager: staff.curator,
      status: finalStatus,
      intakeSource: sourceTag,
      company: staff.company,
      employmentType: clean(
        (record.answers.__legacySheet as Record<string, string> | undefined)?.[
          "ТИП ЗАНЯТОСТИ"
        ],
      ),
      isLegacy: isLegacyCrmImport(record.answers) ? "1" : "0",
      isFormgridImport: isFormgridImport(record.answers) ? "1" : "0",
    },
  };
}

export async function listPortalIntakeCasesForAi(options?: {
  includeArchived?: boolean;
}): Promise<QuestionnaireRecord[]> {
  const all = await listSubmittedForStaff();
  if (options?.includeArchived) return all;
  return all.filter((record) => !isCaseArchived(record.answers));
}

export async function getPortalIntakeCaseById(
  id: string,
): Promise<QuestionnaireRecord | null> {
  return getSubmittedForStaff(id);
}

export function portalCaseLine(
  record: QuestionnaireRecord,
  detailed = false,
): string {
  const staff = readStaffFields(record.answers);
  const process = readProcessStatus(record.answers, record.status);
  const base = [
    portalIntakeDisplayName(record),
    process?.value ? `статус: ${process.value}` : null,
    staff.curator ? `куратор: ${staff.curator}` : null,
    answerEmail(record) ? `email: ${answerEmail(record)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (!detailed) return `- ${base}`;

  const extras = [
    answerPhone(record) ? `тел: ${answerPhone(record)}` : null,
    answerPassport(record) ? `паспорт: ${answerPassport(record)}` : null,
    staff.partner ? `партнёр: ${staff.partner}` : null,
    answerContract(record) ? `договор: ${answerContract(record)}` : null,
    staff.bookingAddress ? `букинг: ${staff.bookingAddress}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  return extras ? `- ${base}; ${extras}` : `- ${base}`;
}
