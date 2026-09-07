export type FinanceErrorCode =
  | "FINANCE_ACCESS_DENIED"
  | "FINANCE_PROFILE_NOT_FOUND"
  | "FINANCE_CLIENT_NOT_FOUND"
  | "FINANCE_CONTRACT_ALREADY_EXISTS"
  | "FINANCE_CONTRACT_AMOUNT_REQUIRED"
  | "FINANCE_CONTRACT_NOT_SET"
  | "FINANCE_CHANGE_REASON_REQUIRED"
  | "FINANCE_AMOUNT_UNCHANGED"
  | "FINANCE_PAYMENT_AMOUNT_INVALID"
  | "FINANCE_PAYMENT_DATE_INVALID"
  | "FINANCE_PAYMENT_NOT_FOUND"
  | "FINANCE_PAYMENT_ALREADY_VOIDED"
  | "FINANCE_DIRECTION_INVALID"
  | "FINANCE_CONFLICT"
  | "FINANCE_CONCURRENT_MODIFICATION"
  | "FINANCE_COMMENT_TOO_LONG"
  | "FINANCE_IDEMPOTENCY_REPLAY"
  | "FINANCE_IDEMPOTENCY_REQUIRED"
  | "FINANCE_STORE_UNAVAILABLE";

export class FinanceError extends Error {
  readonly code: FinanceErrorCode;
  readonly status: number;

  constructor(code: FinanceErrorCode, message: string, status = 400) {
    super(message);
    this.name = "FinanceError";
    this.code = code;
    this.status = status;
  }
}

export function financeErrorStatus(code: FinanceErrorCode): number {
  switch (code) {
    case "FINANCE_ACCESS_DENIED":
      return 403;
    case "FINANCE_PROFILE_NOT_FOUND":
    case "FINANCE_CLIENT_NOT_FOUND":
    case "FINANCE_PAYMENT_NOT_FOUND":
      return 404;
    case "FINANCE_CONFLICT":
    case "FINANCE_CONCURRENT_MODIFICATION":
    case "FINANCE_CONTRACT_ALREADY_EXISTS":
    case "FINANCE_PAYMENT_ALREADY_VOIDED":
    case "FINANCE_IDEMPOTENCY_REPLAY":
      return 409;
    case "FINANCE_STORE_UNAVAILABLE":
      return 503;
    default:
      return 400;
  }
}
