import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAppState, setAppState } from "@/lib/supabase/app-state";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type {
  FinanceContractChangeRecord,
  FinancePaymentRecord,
  FinanceProfileRecord,
} from "./types";

const STORE_PATH = path.join(process.cwd(), ".data", "finance-store.json");
const APP_STATE_KEY = "finance_module_store_v1";

export type FinanceStoreData = {
  profiles: FinanceProfileRecord[];
  payments: FinancePaymentRecord[];
  contractChanges: FinanceContractChangeRecord[];
};

const EMPTY: FinanceStoreData = {
  profiles: [],
  payments: [],
  contractChanges: [],
};

async function readFileStore(): Promise<FinanceStoreData> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as FinanceStoreData;
    if (!Array.isArray(data.profiles) || !Array.isArray(data.payments)) {
      return structuredClone(EMPTY);
    }
    return {
      profiles: data.profiles,
      payments: data.payments,
      contractChanges: Array.isArray(data.contractChanges)
        ? data.contractChanges
        : [],
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function writeFileStore(store: FinanceStoreData): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function readFinanceStore(): Promise<FinanceStoreData> {
  if (isSupabaseConfigured()) {
    try {
      const value = await getAppState<FinanceStoreData>(APP_STATE_KEY);
      if (value?.profiles && value.payments) {
        return {
          profiles: value.profiles,
          payments: value.payments,
          contractChanges: value.contractChanges ?? [],
        };
      }
    } catch (error) {
      console.error("[finance] app_state read", error);
    }
  }
  return readFileStore();
}

export async function writeFinanceStore(store: FinanceStoreData): Promise<void> {
  if (isSupabaseConfigured()) {
    const ok = await setAppState(APP_STATE_KEY, store);
    if (!ok) {
      throw new Error("Failed to persist finance store");
    }
    return;
  }
  await writeFileStore(store);
}

export function newFinanceId(): string {
  return randomUUID();
}

/** Test helper — wipe store contents. */
export async function resetFinanceStoreForTests(): Promise<void> {
  await writeFinanceStore(structuredClone(EMPTY));
}
