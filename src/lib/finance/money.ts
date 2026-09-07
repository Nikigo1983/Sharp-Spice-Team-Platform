/** EUR amounts are stored as integer cents. Never use float as source of truth. */

export const FINANCE_CURRENCY_CODE = "EUR" as const;

export type FinanceCurrencyCode = typeof FINANCE_CURRENCY_CODE;

/** Parse user input like "3800", "3 800", "3800.50", "3800,50" into cents. */
export function parseEuroToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const cents =
    Number.parseInt(whole, 10) * 100 +
    Number.parseInt((frac + "00").slice(0, 2), 10);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents;
}

export function formatEuroFromCents(
  cents: number | null | undefined,
  locale: "en" | "ru" = "ru",
): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const euros = cents / 100;
  const formatted = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    minimumFractionDigits: Number.isInteger(euros) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(euros);
  return `${formatted} €`;
}

export function eurosToCentsExact(euros: number): number {
  return Math.round(euros * 100);
}
