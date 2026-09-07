import { FinanceError } from "./errors";
import { parseEuroToCents } from "./money";

export function validatePaymentDate(raw: string): string {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new FinanceError(
      "FINANCE_PAYMENT_DATE_INVALID",
      "Invalid payment date",
    );
  }
  const ts = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(ts)) {
    throw new FinanceError(
      "FINANCE_PAYMENT_DATE_INVALID",
      "Invalid payment date",
    );
  }
  const min = Date.parse("2000-01-01T00:00:00.000Z");
  const max = Date.parse(
    `${new Date().getUTCFullYear() + 1}-12-31T00:00:00.000Z`,
  );
  if (ts < min || ts > max) {
    throw new FinanceError(
      "FINANCE_PAYMENT_DATE_INVALID",
      "Payment date out of allowed range",
    );
  }
  return trimmed;
}

export function validateContractDate(raw: string): string {
  return validatePaymentDate(raw);
}

/** Accept euro string or positive integer cents. */
export function parseAmountInput(raw: string | number): number {
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw <= 0 || !Number.isSafeInteger(raw)) {
      throw new FinanceError(
        "FINANCE_PAYMENT_AMOUNT_INVALID",
        "Invalid amount",
      );
    }
    return raw;
  }
  const cents = parseEuroToCents(raw);
  if (cents == null || !Number.isSafeInteger(cents)) {
    throw new FinanceError(
      "FINANCE_PAYMENT_AMOUNT_INVALID",
      "Invalid amount",
    );
  }
  return cents;
}

export function assertSafeCents(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isSafeInteger(n)) return n;
  }
  throw new FinanceError(
    "FINANCE_PAYMENT_AMOUNT_INVALID",
    "Unsafe or invalid cents value from database",
  );
}
