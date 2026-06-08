const EMPTY = new Set(["—", "-", "", "н/д", "n/a"]);

export function parseFlexibleDate(raw: string | undefined | null): Date | null {
  const value = (raw ?? "").trim();
  if (!value || EMPTY.has(value.toLowerCase())) return null;

  const iso = Date.parse(value);
  if (!Number.isNaN(iso)) return new Date(iso);

  const dotMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dotMatch) {
    const day = Number(dotMatch[1]);
    const month = Number(dotMatch[2]) - 1;
    let year = Number(dotMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]) - 1;
    let year = Number(slashMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dashMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dashMatch) {
    const d = new Date(Number(dashMatch[1]), Number(dashMatch[2]) - 1, Number(dashMatch[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

const RU_MONTHS: Array<[string, number]> = [
  ["январ", 0],
  ["феврал", 1],
  ["март", 2],
  ["апрел", 3],
  ["мая", 4],
  ["май", 4],
  ["июн", 5],
  ["июл", 6],
  ["август", 7],
  ["сентябр", 8],
  ["октябр", 9],
  ["ноябр", 10],
  ["декабр", 11],
];

export function parseRussianTextDate(raw: string | undefined | null): Date | null {
  const value = (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!value) return null;

  const match = value.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthWord = match[2];
  const year = Number(match[3]);
  const monthEntry = RU_MONTHS.find(([prefix]) => monthWord.startsWith(prefix));
  if (!monthEntry) return null;

  const d = new Date(year, monthEntry[1], day);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseAnyDate(raw: string | undefined | null): Date | null {
  return parseFlexibleDate(raw) ?? parseRussianTextDate(raw);
}

export function pickSubmissionDate(client: {
  submittedAt?: string;
  submittedAt2?: string;
  createdAt?: string;
}): Date | null {
  return (
    parseFlexibleDate(client.submittedAt) ??
    parseFlexibleDate(client.submittedAt2) ??
    parseFlexibleDate(client.createdAt)
  );
}

export function pickApprovalDate(client: {
  approvalAt?: string;
  residenceCardIssuedAt?: string;
}): Date | null {
  return (
    parseFlexibleDate(client.approvalAt) ??
    parseFlexibleDate(client.residenceCardIssuedAt)
  );
}

export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export function formatDays(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${Math.round(value)} дн.`;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
