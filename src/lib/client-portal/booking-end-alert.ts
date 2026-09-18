/**
 * Parse «Дата букинга (от и до)» end date and compute renew alerts.
 */

export const BOOKING_END_WARN_DAYS = 7;

export type BookingEndAlertKind = "ending_soon" | "ended";

export type BookingEndAlert = {
  kind: BookingEndAlertKind;
  endDate: Date;
  /** Negative when already ended. */
  daysRemaining: number;
};

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDiff(from: Date, to: Date): number {
  const ms = startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Parse a single date token: DD.MM.YYYY | DD.MM | DD/MM/YYYY | YYYY-MM-DD */
export function parseBookingDateToken(
  raw: string,
  today: Date = new Date(),
): Date | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "—") return null;

  const withYear = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (withYear) {
    const day = Number(withYear[1]);
    const month = Number(withYear[2]);
    let year = Number(withYear[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // DD.MM or DD-MM without year (common Formgrid / legacy shorthand).
  const noYear = trimmed.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (noYear) {
    const day = Number(noYear[1]);
    const month = Number(noYear[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const thisYear = today.getFullYear();
    let d = new Date(thisYear, month - 1, day);
    if (Number.isNaN(d.getTime())) return null;
    // If clearly in the past (> 60 days), assume next calendar year.
    if (dayDiff(d, today) > 60) {
      d = new Date(thisYear + 1, month - 1, day);
    }
    return d;
  }

  return null;
}

/**
 * End date from «от и до» range. Uses the last segment after -/–/—.
 * If start and end lack year and end MD < start MD, bump end year.
 */
export function parseBookingEndDate(
  bookingRange: string | null | undefined,
  today: Date = new Date(),
): Date | null {
  const raw = (bookingRange ?? "").trim();
  if (!raw || raw === "—") return null;

  const parts = raw.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const endRaw = parts[parts.length - 1]!;
  const startRaw = parts.length > 1 ? parts[0]! : null;

  let end = parseBookingDateToken(endRaw, today);
  if (!end) return null;

  if (startRaw) {
    const startNoYear = /^(\d{1,2})[./-](\d{1,2})$/.test(startRaw.trim());
    const endNoYear = /^(\d{1,2})[./-](\d{1,2})$/.test(endRaw.trim());
    if (startNoYear && endNoYear) {
      const start = parseBookingDateToken(startRaw, today);
      if (start && end.getTime() < start.getTime()) {
        end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate());
      }
    }
  }

  return end;
}

export function getBookingEndAlert(
  bookingRange: string | null | undefined,
  options?: { warnDays?: number; today?: Date },
): BookingEndAlert | null {
  const today = options?.today ?? new Date();
  const warnDays = options?.warnDays ?? BOOKING_END_WARN_DAYS;
  const endDate = parseBookingEndDate(bookingRange, today);
  if (!endDate) return null;

  const daysRemaining = dayDiff(today, endDate);
  if (daysRemaining < 0) {
    return { kind: "ended", endDate, daysRemaining };
  }
  if (daysRemaining <= warnDays) {
    return { kind: "ending_soon", endDate, daysRemaining };
  }
  return null;
}

export function formatBookingEndDateRu(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function formatBookingEndAlertRu(alert: BookingEndAlert): string {
  const when = formatBookingEndDateRu(alert.endDate);
  if (alert.kind === "ended") {
    const ago = Math.abs(alert.daysRemaining);
    if (ago === 0) return `закончился сегодня (${when})`;
    if (ago === 1) return `закончился вчера (${when})`;
    return `закончился ${ago} дн. назад (${when})`;
  }
  if (alert.daysRemaining === 0) return `заканчивается сегодня (${when})`;
  if (alert.daysRemaining === 1) return `заканчивается завтра (${when})`;
  return `заканчивается через ${alert.daysRemaining} дн. (${when})`;
}
