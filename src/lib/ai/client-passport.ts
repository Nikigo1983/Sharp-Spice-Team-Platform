import type { ClientContext } from "@/lib/ai/client-context";

export type PassportExtraction = {
  raw: string;
  normalized: string;
};

export type PassportRecordInput = {
  debugRow?: Record<string, string>;
  passportNumber?: string;
};

const PASSPORT_KEY_PATTERN =
  /passport|паспорт|загран|№\s*загран|номер\s*паспорта|№\s*паспорта/i;

const DIRECT_PASSPORT_KEYS = [
  "passport",
  "номер паспорта",
  "№ паспорта",
  "паспорт",
  "заграничный паспорт",
  "№ заграничного паспорта",
  "8. № заграничного паспорта",
];

/** Минимальная длина нормализованного номера для надёжного сравнения. */
export const PASSPORT_MIN_NORMALIZED_LENGTH = 6;

/**
 * Нормализация номера паспорта: только буквы и цифры, uppercase.
 * Убирает пробелы, дефисы, №, префиксы N/No.
 */
export function normalizePassport(value: string): string {
  let trimmed = (value ?? "").trim();
  if (!trimmed) return "";

  trimmed = trimmed.replace(/^[\s№#]*(?:no\.?|n\.?)\s*/i, "");
  trimmed = trimmed.replace(/№/g, "");

  return trimmed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function pickRawPassportValue(record: PassportRecordInput): string {
  if (record.passportNumber?.trim()) {
    return record.passportNumber.trim();
  }

  const debugRow = record.debugRow ?? {};
  for (const key of DIRECT_PASSPORT_KEYS) {
    const value = debugRow[key]?.trim();
    if (value) return value;
  }

  for (const [key, value] of Object.entries(debugRow)) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    if (PASSPORT_KEY_PATTERN.test(key)) return trimmed;
  }

  return "";
}

export function extractPassportFromClientRecord(
  record: PassportRecordInput | ClientContext,
): PassportExtraction {
  const input: PassportRecordInput =
    "source" in record
      ? { debugRow: record.debugRow }
      : record;

  const raw = pickRawPassportValue(input);
  return {
    raw,
    normalized: normalizePassport(raw),
  };
}

export function isValidNormalizedPassport(normalized: string): boolean {
  return normalized.length >= PASSPORT_MIN_NORMALIZED_LENGTH;
}

export function passportsMatch(
  left: PassportExtraction | PassportRecordInput | ClientContext,
  right: PassportExtraction | PassportRecordInput | ClientContext,
): boolean {
  const leftNorm =
    "normalized" in left && "raw" in left
      ? left.normalized
      : extractPassportFromClientRecord(left).normalized;
  const rightNorm =
    "normalized" in right && "raw" in right
      ? right.normalized
      : extractPassportFromClientRecord(right).normalized;

  if (!isValidNormalizedPassport(leftNorm) || !isValidNormalizedPassport(rightNorm)) {
    return false;
  }

  return leftNorm === rightNorm;
}

export function formatPassportPairDebug(
  left: ClientContext,
  right: ClientContext,
): string[] {
  const crm =
    left.source === "clients"
      ? left
      : right.source === "clients"
        ? right
        : null;
  const formgrid =
    left.source === "new_clients"
      ? left
      : right.source === "new_clients"
        ? right
        : null;

  if (!crm || !formgrid) return [];

  const crmPassport = extractPassportFromClientRecord(crm);
  const formPassport = extractPassportFromClientRecord(formgrid);
  const match = passportsMatch(crmPassport, formPassport);

  return [
    `**Passport cross-check: ${crm.name} (CRM) ↔ ${formgrid.name} (Formgrid)**`,
    `- CRM passport raw: ${crmPassport.raw || "—"}`,
    `- Formgrid passport raw: ${formPassport.raw || "—"}`,
    `- CRM passport normalized: ${crmPassport.normalized || "—"}`,
    `- Formgrid passport normalized: ${formPassport.normalized || "—"}`,
    `- Passport match: **${match ? "true" : "false"}**`,
  ];
}
