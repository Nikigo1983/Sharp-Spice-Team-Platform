export const FINANCE_DIRECTIONS = ["Spain", "Croatia", "Slovenia"] as const;

export type FinanceDirection = (typeof FINANCE_DIRECTIONS)[number];

export const FINANCE_DIRECTION_LABELS_RU: Record<FinanceDirection, string> = {
  Spain: "Испания",
  Croatia: "Хорватия",
  Slovenia: "Словения",
};

const DIRECTION_ALIASES: Record<string, FinanceDirection> = {
  spain: "Spain",
  испания: "Spain",
  croatia: "Croatia",
  хорватия: "Croatia",
  slovenia: "Slovenia",
  словения: "Slovenia",
};

export function normalizeFinanceDirection(
  raw: string | null | undefined,
): FinanceDirection | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key || key === "—" || key === "-") return null;
  return DIRECTION_ALIASES[key] ?? null;
}

export function matchesDirectionFilter(
  clientDirection: string | null | undefined,
  filter: string | null | undefined,
): boolean {
  if (!filter || filter === "all") return true;
  if (filter === "none") {
    return normalizeFinanceDirection(clientDirection) == null;
  }
  const normalized = normalizeFinanceDirection(clientDirection);
  return normalized === filter;
}

export function financeDirectionLabelRu(
  direction: string | null | undefined,
): string {
  const normalized = normalizeFinanceDirection(direction);
  if (normalized) return FINANCE_DIRECTION_LABELS_RU[normalized];
  return direction?.trim() || "—";
}
