import { fetchWithTlsFallback } from "@/lib/google-fetch";
import { currentAiSignal } from "@/lib/ai/request-scope";
import { getCached, setCached } from "./cache";

const DEFAULT_FORMGRID_SPREADSHEET_ID = "1S8Y0VCaAQ78wxg5Rxl8fcFMkwSsvr-X-cLrAlK4nF9Q";
const DEFAULT_FORMGRID_GID = "0";

export type LeadsTableResult = {
  headers: string[];
  rows: string[][];
  source: "google_sheets" | "demo";
};

function getFormgridSpreadsheetId(): string {
  return (
    process.env.GOOGLE_SHEETS_FORMGRID_SPREADSHEET_ID?.trim() ||
    DEFAULT_FORMGRID_SPREADSHEET_ID
  );
}

function getFormgridGid(): string {
  return process.env.GOOGLE_SHEETS_FORMGRID_GID?.trim() || DEFAULT_FORMGRID_GID;
}

function parseCsvRows(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c && c.trim()));
}

async function fetchFormgridCsv(): Promise<string[][]> {
  const spreadsheetId = getFormgridSpreadsheetId();
  const gid = getFormgridGid();
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;

  try {
    const response = await fetchWithTlsFallback(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Formgrid HTTP ${response.status}`);
    return parseCsvRows(await response.text());
  } catch (error) {
    if (currentAiSignal()) throw error;
    console.error("[formgrid] csv fetch failed");
    return [];
  }
}

export async function getFormgridLeadsTable(): Promise<LeadsTableResult> {
  const cacheKey = "formgrid-leads:table";
  const cached = getCached<LeadsTableResult>(cacheKey);
  if (cached) return cached;

  const parsed = await fetchFormgridCsv();
  const headers = parsed[0] ?? [];
  const rows = parsed.slice(1);
  const result: LeadsTableResult = {
    headers,
    rows,
    source: "google_sheets",
  };

  setCached(cacheKey, result);
  return result;
}
