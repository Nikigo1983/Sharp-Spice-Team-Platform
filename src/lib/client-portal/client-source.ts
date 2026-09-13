/**
 * Origin of a portal intake case — used for list badges and filters.
 */

import { isFormgridImport } from "./formgrid-import";
import { isLegacyCrmImport } from "./legacy-crm";

export const MANUAL_STAFF_SOURCE = "manual_staff" as const;
export const CLIENT_SOURCE_IMPORT_KEY = "__import";

export type IntakeClientSource =
  | "legacy"
  | "formgrid"
  | "portal"
  | "manual";

export function isManualStaffImport(
  answers: Record<string, unknown> | null | undefined,
): boolean {
  const meta = answers?.[CLIENT_SOURCE_IMPORT_KEY];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return (meta as { source?: string }).source === MANUAL_STAFF_SOURCE;
}

export function resolveIntakeClientSource(
  answers: Record<string, unknown> | null | undefined,
): IntakeClientSource {
  if (isLegacyCrmImport(answers)) return "legacy";
  if (isFormgridImport(answers)) return "formgrid";
  if (isManualStaffImport(answers)) return "manual";
  return "portal";
}

export function markManualStaffAnswers(
  answers: Record<string, unknown>,
  meta: {
    createdByUserId: string;
    createdByName: string;
    createdAt?: string;
  },
): Record<string, unknown> {
  return {
    ...answers,
    [CLIENT_SOURCE_IMPORT_KEY]: {
      source: MANUAL_STAFF_SOURCE,
      createdByUserId: meta.createdByUserId,
      createdByName: meta.createdByName,
      createdAt: meta.createdAt ?? new Date().toISOString(),
    },
  };
}
