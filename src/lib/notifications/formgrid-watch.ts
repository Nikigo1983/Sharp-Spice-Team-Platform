import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LeadsTableResult } from "@/lib/google-sheets/formgrid-leads";
import { notifyConsultationAssigned, notifyNewClient } from "./emit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAppState, setAppState } from "@/lib/supabase/app-state";

const STORE_PATH = path.join(process.cwd(), ".data", "formgrid-known-leads.json");
const APP_STATE_KEY = "formgrid_known_leads";

type KnownLeadsStore = {
  initialized: boolean;
  rowKeys: string[];
};

const DEFAULT_STORE: KnownLeadsStore = {
  initialized: false,
  rowKeys: [],
};

async function readStoreFromFile(): Promise<KnownLeadsStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as KnownLeadsStore;
    if (!Array.isArray(data.rowKeys)) {
      return DEFAULT_STORE;
    }
    return data;
  } catch {
    return DEFAULT_STORE;
  }
}

async function writeStoreToFile(store: KnownLeadsStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function readStore(): Promise<KnownLeadsStore> {
  if (isSupabaseConfigured()) {
    try {
      const value = await getAppState<KnownLeadsStore>(APP_STATE_KEY);
      return value ?? DEFAULT_STORE;
    } catch (error) {
      console.error("[formgrid-watch] supabase read", error);
      return DEFAULT_STORE;
    }
  }
  return readStoreFromFile();
}

async function writeStore(store: KnownLeadsStore): Promise<void> {
  if (isSupabaseConfigured()) {
    await setAppState(APP_STATE_KEY, store);
    return;
  }
  await writeStoreToFile(store);
}

function buildRowKey(headers: string[], row: string[]): string {
  const nameIdx = headers.findIndex((header) =>
    /имя|name|фио/i.test(header),
  );
  const emailIdx = headers.findIndex((header) =>
    /email|почта|e-mail/i.test(header),
  );
  const phoneIdx = headers.findIndex((header) =>
    /тел|phone/i.test(header),
  );

  const parts = [
    nameIdx >= 0 ? row[nameIdx] : "",
    emailIdx >= 0 ? row[emailIdx] : "",
    phoneIdx >= 0 ? row[phoneIdx] : "",
    row.join("|"),
  ];
  return parts.join("::");
}

function getClientName(headers: string[], row: string[]): string {
  const nameIdx = headers.findIndex((header) =>
    /имя|name|фио/i.test(header),
  );
  const value = nameIdx >= 0 ? row[nameIdx]?.trim() : "";
  return value || "Новый клиент из анкеты";
}

function isConsultationLead(headers: string[], row: string[]): boolean {
  const statusIdx = headers.findIndex((header) =>
    /статус|status|тип|направление/i.test(header),
  );
  if (statusIdx < 0) return false;
  const value = row[statusIdx]?.toLowerCase() ?? "";
  return value.includes("консультац");
}

export async function processFormgridLeadsForNotifications(
  table: LeadsTableResult,
): Promise<void> {
  const store = await readStore();
  const currentKeys = table.rows.map((row) => buildRowKey(table.headers, row));

  if (!store.initialized) {
    await writeStore({
      initialized: true,
      rowKeys: currentKeys,
    });
    return;
  }

  const known = new Set(store.rowKeys);
  const newRows = table.rows.filter(
    (row) => !known.has(buildRowKey(table.headers, row)),
  );

  if (!newRows.length) return;

  for (const row of newRows) {
    const clientName = getClientName(table.headers, row);
    await notifyNewClient({
      clientName,
      source: "анкета Formgrid",
    });

    if (isConsultationLead(table.headers, row)) {
      await notifyConsultationAssigned({ clientName });
    }
  }

  await writeStore({
    initialized: true,
    rowKeys: currentKeys,
  });
}
