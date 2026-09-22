import type {
  QuestionnaireAnswers,
  QuestionnaireRecord,
  QuestionnaireSchema,
  QuestionDefinition,
  SectionDefinition,
} from "./questionnaire-types";
import {
  CROATIA_TRP_SCHEMA,
  SPAIN_TRP_SCHEMA,
  SLOVENIA_TRP_SCHEMA,
} from "./questionnaire-schema";

/** Answer key: first question for new clients — which country TRP is for. */
export const VNZH_COUNTRY_ANSWER_KEY = "vnzh_country";

export type VnzhCountry = "croatia" | "spain" | "slovenia";

export const VNZH_COUNTRY_OPTIONS: Array<{
  value: VnzhCountry;
  labelRu: string;
  labelEn: string;
}> = [
  { value: "croatia", labelRu: "Хорватия", labelEn: "Croatia" },
  { value: "spain", labelRu: "Испания", labelEn: "Spain" },
  { value: "slovenia", labelRu: "Словения", labelEn: "Slovenia" },
];

const TEMPLATE_BY_COUNTRY: Record<VnzhCountry, string> = {
  croatia: CROATIA_TRP_SCHEMA.templateKey,
  spain: SPAIN_TRP_SCHEMA.templateKey,
  slovenia: SLOVENIA_TRP_SCHEMA.templateKey,
};

const SCHEMA_BY_TEMPLATE: Record<string, QuestionnaireSchema> = {
  [CROATIA_TRP_SCHEMA.templateKey]: CROATIA_TRP_SCHEMA,
  [SPAIN_TRP_SCHEMA.templateKey]: SPAIN_TRP_SCHEMA,
  [SLOVENIA_TRP_SCHEMA.templateKey]: SLOVENIA_TRP_SCHEMA,
  // Legacy template key used before multi-country rename
  croatia_digital_nomad_intake: CROATIA_TRP_SCHEMA,
};

export function isVnzhCountry(value: unknown): value is VnzhCountry {
  return value === "croatia" || value === "spain" || value === "slovenia";
}

export function readVnzhCountry(
  answers: QuestionnaireAnswers | null | undefined,
): VnzhCountry | null {
  const raw = answers?.[VNZH_COUNTRY_ANSWER_KEY];
  return isVnzhCountry(raw) ? raw : null;
}

/** Fields auto-filled from the portal session — not real client progress. */
const AUTO_FILLED_ANSWER_KEYS = new Set(
  [CROATIA_TRP_SCHEMA, SPAIN_TRP_SCHEMA, SLOVENIA_TRP_SCHEMA]
    .flatMap((schema) => schema.sections.flatMap((s) => s.questions))
    .filter((q) => q.derivedFrom)
    .map((q) => q.id),
);

/** True when the client has filled something beyond the country picker. */
export function hasQuestionnaireContentBeyondCountry(
  answers: QuestionnaireAnswers,
): boolean {
  for (const [key, value] of Object.entries(answers)) {
    if (key === VNZH_COUNTRY_ANSWER_KEY) continue;
    if (key.startsWith("__")) continue;
    if (AUTO_FILLED_ANSWER_KEYS.has(key)) continue;
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (typeof value === "boolean") return true;
    if (typeof value === "object") return true;
    if (String(value).trim() !== "") return true;
  }
  return false;
}

/**
 * Resolve which schema a record uses.
 * - Explicit `vnzh_country` → that country's schema
 * - Legacy clients (submitted or already filling without country) → Croatia
 * - Brand-new empty drafts → null (show country picker)
 */
export function resolveVnzhCountry(
  record: Pick<QuestionnaireRecord, "status" | "answers">,
): VnzhCountry | null {
  const explicit = readVnzhCountry(record.answers);
  if (explicit) return explicit;

  if (
    record.status === "submitted" ||
    hasQuestionnaireContentBeyondCountry(record.answers)
  ) {
    return "croatia";
  }

  return null;
}

export function resolveSchemaForRecord(
  record: Pick<QuestionnaireRecord, "status" | "answers">,
): QuestionnaireSchema {
  const country = resolveVnzhCountry(record);
  if (!country) {
    return CROATIA_TRP_SCHEMA;
  }
  return SCHEMA_BY_TEMPLATE[TEMPLATE_BY_COUNTRY[country]] ?? CROATIA_TRP_SCHEMA;
}

export function getSchemaByTemplateKey(
  templateKey: string | null | undefined,
): QuestionnaireSchema {
  if (!templateKey) return CROATIA_TRP_SCHEMA;
  return SCHEMA_BY_TEMPLATE[templateKey] ?? CROATIA_TRP_SCHEMA;
}

export function needsVnzhCountrySelection(
  record: Pick<QuestionnaireRecord, "status" | "answers">,
): boolean {
  if (record.status === "submitted") return false;
  return resolveVnzhCountry(record) === null;
}

/** Map legacy CRM direction / country labels onto TRP countries. */
export function mapDirectionLabelToVnzhCountry(
  value: unknown,
): VnzhCountry | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (raw.includes("spain") || raw.includes("испан")) return "spain";
  if (raw.includes("slovenia") || raw.includes("словен")) return "slovenia";
  if (raw.includes("croatia") || raw.includes("хорват")) return "croatia";
  return null;
}

/**
 * Country for staff lists/filters: explicit questionnaire choice first,
 * then legacy CRM direction, then Croatia for submitted portal cases.
 */
export function resolveStaffCaseCountry(
  record: Pick<QuestionnaireRecord, "status" | "answers">,
): VnzhCountry {
  const explicit = readVnzhCountry(record.answers);
  if (explicit) return explicit;

  const identityRaw = record.answers?.__identity;
  const legacyDirection =
    identityRaw &&
    typeof identityRaw === "object" &&
    !Array.isArray(identityRaw)
      ? (identityRaw as { direction?: unknown }).direction
      : undefined;

  const fromDirection =
    mapDirectionLabelToVnzhCountry(legacyDirection) ||
    mapDirectionLabelToVnzhCountry(record.answers?.direction) ||
    mapDirectionLabelToVnzhCountry(record.answers?.country);
  if (fromDirection) return fromDirection;

  return resolveVnzhCountry(record) ?? "croatia";
}

export function vnzhCountryLabelRu(country: VnzhCountry): string {
  return (
    VNZH_COUNTRY_OPTIONS.find((opt) => opt.value === country)?.labelRu ??
    "Хорватия"
  );
}

export function schemaQuestions(
  schema: QuestionnaireSchema,
): QuestionDefinition[] {
  return schema.sections.flatMap((section) => section.questions);
}

export function schemaSections(
  schema: QuestionnaireSchema,
): SectionDefinition[] {
  return [...schema.sections].sort((a, b) => a.order - b.order);
}
