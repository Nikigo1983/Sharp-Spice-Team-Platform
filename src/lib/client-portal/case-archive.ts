/** Soft-archive flag for submitted client-portal cases. */

export const CASE_ARCHIVE_KEY = "__archive";

export type CaseArchiveState = {
  archived: boolean;
  archivedAt: string | null;
  archivedByName: string | null;
  archivedByUserId: string | null;
};

export function isCaseArchived(
  answers: Record<string, unknown> | null | undefined,
): boolean {
  const raw = answers?.[CASE_ARCHIVE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as { archived?: unknown }).archived === true;
}

export function readCaseArchive(
  answers: Record<string, unknown> | null | undefined,
): CaseArchiveState | null {
  const raw = answers?.[CASE_ARCHIVE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  return {
    archived: obj.archived === true,
    archivedAt: typeof obj.archivedAt === "string" ? obj.archivedAt : null,
    archivedByName:
      typeof obj.archivedByName === "string" ? obj.archivedByName : null,
    archivedByUserId:
      typeof obj.archivedByUserId === "string" ? obj.archivedByUserId : null,
  };
}

export function writeCaseArchive(
  answers: Record<string, unknown>,
  state: CaseArchiveState,
): Record<string, unknown> {
  return {
    ...answers,
    [CASE_ARCHIVE_KEY]: {
      archived: state.archived,
      archivedAt: state.archivedAt,
      archivedByName: state.archivedByName,
      archivedByUserId: state.archivedByUserId,
    },
  };
}

export function normalizeClientNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match display name against an archive target like "Смоленская (Израиль)" or "Кирий Андрей". */
export function clientNameMatchesTarget(
  displayName: string,
  target: string,
): boolean {
  const name = normalizeClientNameForMatch(displayName);
  const targetClean = normalizeClientNameForMatch(
    target.replace(/\s*\([^)]*\)\s*/g, " "),
  );
  if (!name || !targetClean) return false;
  if (name === targetClean) return true;
  if (name.startsWith(`${targetClean} `)) return true;

  const targetWords = targetClean.split(" ").filter(Boolean);
  if (targetWords.length > 1) {
    return targetWords.every((word) => name.includes(word));
  }

  const firstToken = name.split(/[\s,/-]+/).filter(Boolean)[0] ?? "";
  return firstToken === targetClean;
}
