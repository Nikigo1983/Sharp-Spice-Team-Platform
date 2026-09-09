import { parseFlexibleDate } from "@/lib/analytics/dates";

/** Inclusive YYYY-MM-DD day bounds in local time. */
export function dateInRange(
  raw: string | null | undefined,
  fromYmd?: string,
  toYmd?: string,
): boolean {
  if (!fromYmd && !toYmd) return true;
  const date = parseFlexibleDate(raw);
  if (!date) return false;
  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  if (fromYmd) {
    const [y, m, d] = fromYmd.split("-").map(Number);
    if (!y || !m || !d) return false;
    const from = new Date(y, m - 1, d).getTime();
    if (dayStart < from) return false;
  }
  if (toYmd) {
    const [y, m, d] = toYmd.split("-").map(Number);
    if (!y || !m || !d) return false;
    const to = new Date(y, m - 1, d).getTime();
    if (dayStart > to) return false;
  }
  return true;
}

export function fieldEqualsLoose(
  field: string | null | undefined,
  needle: string | null | undefined,
): boolean {
  const expected = (needle ?? "").trim();
  if (!expected) return true;
  return (field ?? "").trim().toLowerCase() === expected.toLowerCase();
}

export function fieldContainsLoose(
  field: string | null | undefined,
  needle: string | null | undefined,
): boolean {
  const expected = (needle ?? "").trim().toLowerCase();
  if (!expected) return true;
  return (field ?? "").toLowerCase().includes(expected);
}

export function hasNonEmptyField(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  return Boolean(trimmed) && trimmed !== "—";
}

export type ApprovalFilter = "" | "approved" | "not_approved";
export type PresenceFilter = "" | "yes" | "no";

export function matchesApprovalFilter(
  approvalDate: string | null | undefined,
  filter: ApprovalFilter,
): boolean {
  if (!filter) return true;
  const approved = hasNonEmptyField(approvalDate);
  if (filter === "approved") return approved;
  return !approved;
}

export function matchesPresenceFilter(
  value: string | null | undefined,
  filter: PresenceFilter,
): boolean {
  if (!filter) return true;
  const present = hasNonEmptyField(value);
  if (filter === "yes") return present;
  return !present;
}
