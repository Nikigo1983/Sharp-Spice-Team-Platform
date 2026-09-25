import { isCaseArchived } from "@/lib/client-portal/case-archive";
import {
  isApplicationSubmitted,
  isStaffNewClientQueue,
} from "@/lib/client-portal/application-submitted";
import { resolveIntakeClientSource } from "@/lib/client-portal/client-source";
import {
  FORMGRID_IMPORT_KEY,
  isFormgridImport,
  isFormgridNewClientQueue,
} from "@/lib/client-portal/formgrid-import";
import {
  LEGACY_IMPORT_KEY,
  isLegacyCrmImport,
} from "@/lib/client-portal/legacy-crm";

const IMPORT_STAMP_TOLERANCE_MS = 60_000;

function readImportStamp(
  answers: Record<string, unknown> | null | undefined,
): string | null {
  if (!answers) return null;
  for (const key of [FORMGRID_IMPORT_KEY, LEGACY_IMPORT_KEY] as const) {
    const meta = answers[key];
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) continue;
    const importedAt = (meta as { importedAt?: unknown }).importedAt;
    if (typeof importedAt === "string" && importedAt.trim()) {
      return importedAt.trim();
    }
  }
  return null;
}

function timestampsNear(a: string, b: string, toleranceMs: number): boolean {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= toleranceMs;
}

/**
 * True when staff_opened_at was stamped by a bulk import, not by opening the card.
 * Used so a real staff open can overwrite the import stamp.
 */
export function isImportStaffOpenStamp(record: {
  staffOpenedAt: string | null;
  createdAt: string;
  answers: Record<string, unknown>;
}): boolean {
  if (!record.staffOpenedAt) return false;

  const importedAt = readImportStamp(record.answers);
  if (
    importedAt &&
    timestampsNear(record.staffOpenedAt, importedAt, IMPORT_STAMP_TOLERANCE_MS)
  ) {
    return true;
  }

  if (
    (isFormgridImport(record.answers) || isLegacyCrmImport(record.answers)) &&
    timestampsNear(
      record.staffOpenedAt,
      record.createdAt,
      IMPORT_STAMP_TOLERANCE_MS,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Yellow «Новый клиент» badge / «Новые клиенты» filter:
 * - portal Emigrant submissions until «Заявка подана»
 * - Formgrid cases flagged newClientQueue until «Заявка подана»
 * - any case staff explicitly placed into the new-client queue
 *   (e.g. legacy CRM) until «Заявка подана»
 */
export function isPortalNewClientBadge(record: {
  answers: Record<string, unknown>;
}): boolean {
  if (isCaseArchived(record.answers)) return false;
  if (isApplicationSubmitted(record.answers)) return false;
  if (isStaffNewClientQueue(record.answers)) return true;
  const source = resolveIntakeClientSource(record.answers);
  if (source === "portal") return true;
  if (source === "formgrid") return isFormgridNewClientQueue(record.answers);
  return false;
}

/**
 * Unopened portal/formgrid-new cases — used for nav badge counts.
 */
export function isQuestionnaireNewForStaff(record: {
  staffOpenedAt: string | null;
  createdAt: string;
  answers: Record<string, unknown>;
}): boolean {
  if (!isPortalNewClientBadge(record)) return false;
  return !record.staffOpenedAt;
}
