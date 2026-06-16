import { fetchWithTlsFallback } from "@/lib/google-fetch";
import {
  getGoogleAccessToken,
  isGoogleSheetsConfigured,
  isGoogleSheetsPublicClientsConfigured,
} from "./auth";
import * as https from "node:https";
import { getCached, invalidateCache, setCached } from "./cache";
import {
  parseClientRows,
  parseCroatiaExternalClientsRows,
  parseDocumentRows,
  parseNoteRows,
  parseSurveyRows,
} from "./parse";
import type { Client, ClientDocument, ClientNote, ClientSurvey } from "./types";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

function getSpreadsheetId(): string {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID!.trim();
}

function getRange(sheetEnvKey: string, fallback: string): string {
  return process.env[sheetEnvKey]?.trim() || fallback;
}

function getClientsWriteRange(): string {
  return getRange("GOOGLE_SHEETS_CLIENTS_RANGE", "'В Работе'!A:M");
}

export class GoogleSheetsClient {
  private usesPublicClientsExport(): boolean {
    return isGoogleSheetsPublicClientsConfigured();
  }

  private fetchTextInsecure(url: string, redirectDepth = 0): Promise<string> {
    return new Promise((resolve, reject) => {
      if (redirectDepth > 5) {
        reject(new Error("[google-sheets] insecure fetch failed: too many redirects"));
        return;
      }

      const req = https.get(
        url,
        {
          rejectUnauthorized: false,
          headers: {
            "User-Agent": "sharp-spice-team-platform/1.0",
          },
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
              (status === 301 || status === 302 || status === 303 || status === 307 || status === 308)
            ) {
              const nextUrl = new URL(location, url).toString();
              this.fetchTextInsecure(nextUrl, redirectDepth + 1)
                .then(resolve)
                .catch(reject);
              return;
            }

            if (status < 200 || status >= 300) {
              reject(
                new Error(
                  `[google-sheets] insecure fetch failed: ${status} ${body.slice(0, 200)}`,
                ),
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

  private async fetchPublicClientsCsv(): Promise<string[][]> {
    if (!isGoogleSheetsPublicClientsConfigured()) return [];
    const spreadsheetId = getSpreadsheetId();
    const gid = process.env.GOOGLE_SHEETS_PUBLIC_CLIENTS_GID!.trim();
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(
      gid,
    )}`;

    try {
      const response = await fetchWithTlsFallback(url, {
        cache: "no-store",
      });

      if (!response.ok) {
        console.error(
          "[google-sheets] public csv fetch error",
          response.status,
          await response.text(),
        );
        return [];
      }

      const text = await response.text();
      return this.parseCsvRows(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const causeMessage =
        error && typeof error === "object" && "cause" in error
          ? String((error as { cause?: unknown }).cause ?? "")
          : "";
      const combined = `${message} ${causeMessage}`.toLowerCase();
      const tlsError =
        combined.includes("unable_to_verify_leaf_signature") ||
        combined.includes("unable to verify the first certificate") ||
        combined.includes("fetch failed");

      if (!tlsError) {
        console.error("[google-sheets] public csv fetch failed", error);
      }

      // Dev fallback for Windows environments with broken local CA chain
      // (and for generic fetch failures around TLS in Node).
      try {
        console.warn(
          "[google-sheets] TLS chain error detected, retrying CSV download with relaxed TLS verification",
        );
        const text = await this.fetchTextInsecure(url);
        return this.parseCsvRows(text);
      } catch (insecureError) {
        console.error(
          "[google-sheets] public csv insecure fallback failed",
          insecureError,
        );
        return [];
      }
    }
  }

  private parseCsvRows(text: string): string[][] {
    // Google CSV может содержать BOM.
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
        cell = "";
        rows.push(row);
        row = [];
        continue;
      }

      if (ch === "\r") {
        // ignore
        continue;
      }

      cell += ch;
    }

    // last cell
    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      rows.push(row);
    }

    // убираем пустые строки
    return rows.filter((r) => r.some((c) => c && c.trim()));
  }

  private async fetchRange(range: string): Promise<string[][]> {
    if (this.usesPublicClientsExport()) {
      return [];
    }

    const token = await getGoogleAccessToken();
    if (!token) return [];

    const spreadsheetId = getSpreadsheetId();
    const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`;

    try {
      const response = await fetchWithTlsFallback(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errText = await response.text();
        if (
          errText.includes("Office file") ||
          errText.includes("FAILED_PRECONDITION")
        ) {
          console.warn(
            "[google-sheets] supplementary range unavailable for this file:",
            range,
          );
        } else {
          console.error("[google-sheets] fetch error", range, errText);
        }
        return [];
      }

      const data = (await response.json()) as { values?: string[][] };
      return data.values ?? [];
    } catch (error) {
      console.error("[google-sheets] fetchRange failed", range, error);
      return [];
    }
  }

  private async appendRow(range: string, values: string[]): Promise<boolean> {
    const token = await getGoogleAccessToken();
    if (!token) return false;

    const spreadsheetId = getSpreadsheetId();
    const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    try {
      const response = await fetchWithTlsFallback(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [values] }),
      });

      if (!response.ok) {
        console.error("[google-sheets] append error", await response.text());
        return false;
      }

      invalidateCache("clients");
      return true;
    } catch (error) {
      console.error("[google-sheets] append failed", error);
      return false;
    }
  }

  private async updateCell(range: string, value: string): Promise<boolean> {
    const token = await getGoogleAccessToken();
    if (!token) return false;

    const spreadsheetId = getSpreadsheetId();
    const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

    try {
      const response = await fetchWithTlsFallback(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [[value]] }),
      });

      if (!response.ok) {
        console.error("[google-sheets] update error", await response.text());
        return false;
      }
    } catch (error) {
      console.error("[google-sheets] update failed", error);
      return false;
    }

    invalidateCache("clients");
    return true;
  }

  async getClientsRows(): Promise<string[][]> {
    const cacheKey = "clients:rows";
    const cached = getCached<string[][]>(cacheKey);
    if (cached) return cached;

    const range = getRange("GOOGLE_SHEETS_CLIENTS_RANGE", "Clients!A1:Z2000");
    const rows = await this.fetchRange(range);
    setCached(cacheKey, rows);
    return rows;
  }

  async getClients(): Promise<Client[]> {
    const cacheKey = "clients:parsed";
    const cached = getCached<Client[]>(cacheKey);
    if (cached) return cached;

    let clients: Client[] = [];
    if (isGoogleSheetsPublicClientsConfigured()) {
      const rows = await this.fetchPublicClientsCsv();
      clients = parseCroatiaExternalClientsRows(rows);
    } else {
      const token = await getGoogleAccessToken();
      if (token) {
        const rows = await this.getClientsRows();
        clients = parseClientRows(rows);
      }
    }

    setCached(cacheKey, clients);
    return clients;
  }

  async getClientById(id: string): Promise<Client | null> {
    const clients = await this.getClients();
    return clients.find((c) => c.id === id) ?? null;
  }

  async getSurveysRows(): Promise<string[][]> {
    const cacheKey = "surveys:rows";
    const cached = getCached<string[][]>(cacheKey);
    if (cached) return cached;

    const range = getRange("GOOGLE_SHEETS_FORMS_RANGE", "Forms!A1:Z2000");
    const rows = await this.fetchRange(range);
    setCached(cacheKey, rows);
    return rows;
  }

  async getSurveysByClientId(clientId: string): Promise<ClientSurvey[]> {
    const rows = await this.getSurveysRows();
    return parseSurveyRows(rows).filter((s) => s.clientId === clientId);
  }

  async getDocumentsRows(): Promise<string[][]> {
    const cacheKey = "documents:rows";
    const cached = getCached<string[][]>(cacheKey);
    if (cached) return cached;

    const range = getRange(
      "GOOGLE_SHEETS_DOCUMENTS_RANGE",
      "Documents!A1:Z2000",
    );
    const rows = await this.fetchRange(range);
    setCached(cacheKey, rows);
    return rows;
  }

  async getDocumentsByClientId(clientId: string): Promise<ClientDocument[]> {
    const rows = await this.getDocumentsRows();
    return parseDocumentRows(rows).filter((d) => d.clientId === clientId);
  }

  async getNotesRows(): Promise<string[][]> {
    const cacheKey = "notes:rows";
    const cached = getCached<string[][]>(cacheKey);
    if (cached) return cached;

    const range = getRange("GOOGLE_SHEETS_NOTES_RANGE", "Notes!A1:Z5000");
    const rows = await this.fetchRange(range);
    setCached(cacheKey, rows);
    return rows;
  }

  async getNotesByClientId(clientId: string): Promise<ClientNote[]> {
    const rows = await this.getNotesRows();
    return parseNoteRows(rows)
      .filter((n) => n.clientId === clientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async appendNote(
    clientId: string,
    author: string,
    text: string,
  ): Promise<boolean> {
    const createdAt = new Date().toLocaleDateString("ru-RU");
    const range = getRange("GOOGLE_SHEETS_NOTES_RANGE", "Notes!A1:Z").split(
      "!",
    )[0];
    const ok = await this.appendRow(`${range}!A:E`, [
      `NT-${Date.now()}`,
      clientId,
      createdAt,
      author,
      text,
    ]);
    if (ok) invalidateCache("notes");
    return ok;
  }

  async updateNote(rowIndex: number, text: string): Promise<boolean> {
    const sheet = getRange("GOOGLE_SHEETS_NOTES_RANGE", "Notes!A1:Z").split(
      "!",
    )[0];
    const ok = await this.updateCell(`${sheet}!E${rowIndex}`, text);
    if (ok) invalidateCache("notes");
    return ok;
  }

  async updateClientField(
    client: Client,
    field: keyof Client,
    value: string,
  ): Promise<boolean> {
    if (!client.rowIndex) return false;

    const rows = await this.getClientsRows();
    const headers = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
    const fieldHeaders: Partial<Record<keyof Client, string[]>> = {
      name: ["имя", "name"],
      phone: ["телефон", "phone"],
      email: ["email"],
      country: ["страна", "country"],
      citizenship: ["гражданство", "citizenship"],
      direction: ["направление", "direction"],
      status: ["статус", "status"],
      manager: ["менеджер", "ответственный менеджер", "manager"],
      lastActivity: ["последняя активность"],
    };

    const candidates = fieldHeaders[field];
    if (!candidates) return false;

    const colIndex = headers.findIndex((h) =>
      candidates.some((c) => h === c || h.includes(c)),
    );
    if (colIndex < 0) return false;

    const colLetter = String.fromCharCode("A".charCodeAt(0) + colIndex);
    const sheet = getRange("GOOGLE_SHEETS_CLIENTS_RANGE", "Clients!A1:Z").split(
      "!",
    )[0];

    return this.updateCell(`${sheet}!${colLetter}${client.rowIndex}`, value);
  }

  async appendExternalClientRow(values: string[]): Promise<boolean> {
    const range = getClientsWriteRange();
    return this.appendRow(range, values);
  }
}

let clientInstance: GoogleSheetsClient | null = null;

export function getGoogleSheetsClient(): GoogleSheetsClient {
  if (!clientInstance) clientInstance = new GoogleSheetsClient();
  return clientInstance;
}

export function sheetsConfigured(): boolean {
  return isGoogleSheetsConfigured();
}
