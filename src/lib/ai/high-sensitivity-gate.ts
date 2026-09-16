/**
 * High-sensitivity field gate (Security Gate 1).
 * Default: restrictive — fields stay out of model context unless capability granted.
 */

import {
  type HighSensitivityCapability,
  sensitivityForFieldKey,
} from "@/lib/ai/ai-data-sensitivity";

export type HighSensitivityAllowSet = ReadonlySet<HighSensitivityCapability>;

export const EMPTY_HIGH_SENSITIVITY_ALLOW: HighSensitivityAllowSet = new Set();

export function createHighSensitivityAllow(
  caps: HighSensitivityCapability[] = [],
): HighSensitivityAllowSet {
  return new Set(caps);
}

export function isHighSensitivityAllowed(
  capability: HighSensitivityCapability,
  allow: HighSensitivityAllowSet = EMPTY_HIGH_SENSITIVITY_ALLOW,
): boolean {
  return allow.has(capability);
}

/**
 * Drop or redact object keys that map to high-sensitivity capabilities
 * not present in `allow`. Secrets are always removed.
 */
export function applyHighSensitivityGateToRecord(
  record: Record<string, unknown>,
  allow: HighSensitivityAllowSet = EMPTY_HIGH_SENSITIVITY_ALLOW,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const spec = sensitivityForFieldKey(key);
    if (spec?.prohibitedFromModel) continue;
    if (spec?.highSensitivity && !allow.has(spec.highSensitivity)) continue;
    out[key] = value;
  }
  return out;
}

/** Field labels commonly used in portal field cards / SafeClient. */
const LABEL_TO_CAPABILITY: Array<{
  match: RegExp;
  capability: HighSensitivityCapability;
}> = [
  { match: /паспорт|passport/i, capability: "passport_number" },
  {
    match: /дата\s*рожден|date\s*of\s*birth|\bdob\b/i,
    capability: "date_of_birth",
  },
  {
    match: /адрес\s*прожив|residence\s*address|home\s*address|booking\s*address|адрес\s*букинг/i,
    capability: "residential_address",
  },
  {
    match:
      /document\s*content|ocr|текст\s*документ|загранпаспорт\s*\(|справка о несудимости|банковск\w*\s+выписк|внж\s+другой\s+стран|вложен|подпис[ьи]\s+клиент|медстраховк/i,
    capability: "document_content",
  },
];

export function capabilityForFieldLabel(
  label: string,
): HighSensitivityCapability | null {
  for (const row of LABEL_TO_CAPABILITY) {
    if (row.match.test(label)) return row.capability;
  }
  return null;
}

export function filterFieldRowsForModelContext<
  T extends { label: string; value?: unknown },
>(
  rows: T[],
  allow: HighSensitivityAllowSet = EMPTY_HIGH_SENSITIVITY_ALLOW,
): T[] {
  return rows.filter((row) => {
    const cap = capabilityForFieldLabel(row.label);
    if (!cap) return true;
    return allow.has(cap);
  });
}

/**
 * Strip unauthorized high-sensitivity category lines from portal survey text
 * (including empty «[не заполнено]» labels) before model ingress.
 */
export function filterSurveyDataForModelContext(
  surveyData: string,
  allow: HighSensitivityAllowSet = EMPTY_HIGH_SENSITIVITY_ALLOW,
): string {
  if (!surveyData.trim()) return surveyData;
  return surveyData
    .split("\n")
    .filter((line) => {
      const match = line.match(/^-\s*([^:]+):/);
      if (!match?.[1]) return true;
      const cap = capabilityForFieldLabel(match[1].trim());
      if (!cap) return true;
      return allow.has(cap);
    })
    .join("\n");
}
