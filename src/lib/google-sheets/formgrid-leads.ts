import { fetchWithTlsFallback } from "@/lib/google-fetch";
import * as https from "node:https";
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

function fetchTextInsecure(url: string, redirectDepth = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectDepth > 5) {
      reject(new Error("[formgrid] insecure fetch failed: too many redirects"));
      return;
    }

    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: { "User-Agent": "sharp-spice-team-platform/1.0" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          const location = res.headers.location;

          if (
            location &&
            (status === 301 ||
              status === 302 ||
              status === 303 ||
              status === 307 ||
              status === 308)
          ) {
            const nextUrl = new URL(location, url).toString();
            fetchTextInsecure(nextUrl, redirectDepth + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (status < 200 || status >= 300) {
            reject(
              new Error(`[formgrid] insecure fetch failed: ${status} ${body.slice(0, 200)}`),
            );
            return;
          }

          resolve(body);
        });
      },
    );

    req.on("error", reject);
  });
}

async function fetchFormgridCsv(): Promise<string[][]> {
  const spreadsheetId = getFormgridSpreadsheetId();
  const gid = getFormgridGid();
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;

  try {
    const response = await fetchWithTlsFallback(url, { cache: "no-store" });
    if (!response.ok) {
      console.error("[formgrid] csv fetch error", response.status, await response.text());
      return [];
    }
    return parseCsvRows(await response.text());
  } catch (error) {
    try {
      const text = await fetchTextInsecure(url);
      return parseCsvRows(text);
    } catch (insecureError) {
      console.error("[formgrid] csv insecure fallback failed", insecureError);
      console.error("[formgrid] original fetch failed", error);
      return [];
    }
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
