/** Парсинг и сопоставление дат из таблицы «Клиенты» и запросов менеджера. */

export type ParsedDateParts = {
  day: number;
  month: number;
  year: number;
};

export const MONTH_PATTERNS: Array<{ pattern: RegExp; month: number; label: string }> = [
  { pattern: /январ/i, month: 1, label: "январь" },
  { pattern: /феврал/i, month: 2, label: "февраль" },
  { pattern: /март/i, month: 3, label: "март" },
  { pattern: /апрел/i, month: 4, label: "апрель" },
  { pattern: /ма[йя]/i, month: 5, label: "май" },
  { pattern: /июн/i, month: 6, label: "июнь" },
  { pattern: /июл/i, month: 7, label: "июль" },
  { pattern: /август/i, month: 8, label: "август" },
  { pattern: /сентябр/i, month: 9, label: "сентябрь" },
  { pattern: /октябр/i, month: 10, label: "октябрь" },
  { pattern: /ноябр/i, month: 11, label: "ноябрь" },
  { pattern: /декабр/i, month: 12, label: "декабрь" },
];

const DATE_TOKEN_PATTERN =
  /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g;

export function parseDateParts(value: string): ParsedDateParts | null {
  const trimmed = value.trim();
  const dmy = trimmed.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const month = Number(dmy[2]);
    const day = Number(dmy[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { day, month, year };
    }
  }

  const dmyDash = trimmed.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (dmyDash) {
    const year = Number(dmyDash[3].length === 2 ? `20${dmyDash[3]}` : dmyDash[3]);
    const month = Number(dmyDash[2]);
    const day = Number(dmyDash[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { day, month, year };
    }
  }

  const ymd = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return {
      day: Number(ymd[3]),
      month: Number(ymd[2]),
      year: Number(ymd[1]),
    };
  }

  return null;
}

export function queryContainsDateLiteral(query: string): boolean {
  return DATE_TOKEN_PATTERN.test(query);
}

export function stripDateLiteralsFromQuery(query: string): string {
  return query.replace(DATE_TOKEN_PATTERN, " ");
}

export function extractAllMonthsFromQuery(query: string): number[] {
  const lower = query.toLowerCase();
  const months = new Set<number>();
  for (const { pattern, month } of MONTH_PATTERNS) {
    if (pattern.test(lower)) {
      months.add(month);
    }
  }
  return [...months].sort((left, right) => left - right);
}

export function extractYearFromQuery(query: string): number | null {
  const match = query.match(/\b(20\d{2})\b/);
  if (!match?.[1]) return null;
  const year = Number(match[1]);
  return year >= 2000 ? year : null;
}

export function isSubmissionDateQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return /подавал|подали|подач|подана|подан|заявк|submission|filed/i.test(lower);
}

export function isBookingDateQuery(query: string): boolean {
  return /букинг|booking/i.test(query);
}

export function dateInMonths(
  value: string,
  months: number[],
  year?: number | null,
): boolean {
  if (months.length === 0) return false;

  const parsed = parseDateParts(value);
  if (!parsed) {
    return false;
  }

  if (!months.includes(parsed.month)) {
    return false;
  }

  if (year && parsed.year !== year) {
    return false;
  }

  return true;
}

export function bookingEndsInMonth(
  bookingRange: string,
  month: number,
  year?: number | null,
): boolean {
  const parts = bookingRange.split(/\s*[-–—]\s*/);
  const endPart = (parts[parts.length - 1] ?? bookingRange).trim();
  return dateInMonths(endPart, [month], year);
}

export function formatMonthsForIntent(months: number[]): string {
  const labels = months
    .map((month) => MONTH_PATTERNS.find((entry) => entry.month === month)?.label)
    .filter(Boolean);
  return labels.join(", ");
}
