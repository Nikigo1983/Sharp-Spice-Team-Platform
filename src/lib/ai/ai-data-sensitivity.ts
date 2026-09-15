/**
 * AI data sensitivity contract (Security Gate 1).
 * Used by privacy policy, high-sensitivity gates, and future EvidencePack projections.
 * Never embed real client values here.
 */

export const AI_DATA_SENSITIVITY_CLASSES = [
  "PUBLIC",
  "INTERNAL",
  "CLIENT_PERSONAL",
  "CLIENT_FINANCIAL",
  "CLIENT_CASE_SENSITIVE",
  "CLIENT_IDENTITY_DOCUMENT",
  "STAFF_INTERNAL",
  "SECRET_CREDENTIAL",
] as const;

export type AiDataSensitivityClass =
  (typeof AI_DATA_SENSITIVITY_CLASSES)[number];

/** Capabilities that must be explicitly requested before entering model context. */
export const HIGH_SENSITIVITY_CAPABILITIES = [
  "passport_number",
  "date_of_birth",
  "residential_address",
  "document_content",
] as const;

export type HighSensitivityCapability =
  (typeof HIGH_SENSITIVITY_CAPABILITIES)[number];

export type AiFieldSensitivitySpec = {
  fieldKey: string;
  sensitivity: AiDataSensitivityClass;
  highSensitivity?: HighSensitivityCapability | null;
  /** Never allowed in external model context. */
  prohibitedFromModel: boolean;
};

/**
 * Canonical field map (names only). Extensible for EvidencePack projections.
 */
export const AI_FIELD_SENSITIVITY: AiFieldSensitivitySpec[] = [
  {
    fieldKey: "displayName",
    sensitivity: "CLIENT_PERSONAL",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "email",
    sensitivity: "CLIENT_PERSONAL",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "phone",
    sensitivity: "CLIENT_PERSONAL",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "bookingAddress",
    sensitivity: "CLIENT_PERSONAL",
    highSensitivity: "residential_address",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "residenceAddress",
    sensitivity: "CLIENT_PERSONAL",
    highSensitivity: "residential_address",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "dateOfBirth",
    sensitivity: "CLIENT_CASE_SENSITIVE",
    highSensitivity: "date_of_birth",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "passport",
    sensitivity: "CLIENT_IDENTITY_DOCUMENT",
    highSensitivity: "passport_number",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "passportNumber",
    sensitivity: "CLIENT_IDENTITY_DOCUMENT",
    highSensitivity: "passport_number",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "documentContent",
    sensitivity: "CLIENT_IDENTITY_DOCUMENT",
    highSensitivity: "document_content",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "contractAmount",
    sensitivity: "CLIENT_FINANCIAL",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "balance",
    sensitivity: "CLIENT_FINANCIAL",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "paidAmount",
    sensitivity: "CLIENT_FINANCIAL",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "status",
    sensitivity: "CLIENT_CASE_SENSITIVE",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "notes",
    sensitivity: "STAFF_INTERNAL",
    prohibitedFromModel: false,
  },
  {
    fieldKey: "appPassword",
    sensitivity: "SECRET_CREDENTIAL",
    prohibitedFromModel: true,
  },
  {
    fieldKey: "password",
    sensitivity: "SECRET_CREDENTIAL",
    prohibitedFromModel: true,
  },
  {
    fieldKey: "apiKey",
    sensitivity: "SECRET_CREDENTIAL",
    prohibitedFromModel: true,
  },
];

export function sensitivityForFieldKey(
  fieldKey: string,
): AiFieldSensitivitySpec | null {
  const key = fieldKey.trim();
  if (!key) return null;
  return (
    AI_FIELD_SENSITIVITY.find(
      (row) => row.fieldKey.toLowerCase() === key.toLowerCase(),
    ) ?? null
  );
}

export function isSecretCredentialField(fieldKey: string): boolean {
  const spec = sensitivityForFieldKey(fieldKey);
  if (spec?.prohibitedFromModel) return true;
  return /password|token|secret|api[_-]?key|credential/i.test(fieldKey);
}

export function isHighSensitivityField(fieldKey: string): boolean {
  return Boolean(sensitivityForFieldKey(fieldKey)?.highSensitivity);
}
