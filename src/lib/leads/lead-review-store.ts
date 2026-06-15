import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  LeadReviewRecord,
  LeadReviewStatus,
  LeadReviewStore,
} from "@/lib/leads/lead-review-types";
import { getAppState, setAppState } from "@/lib/supabase/app-state";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const STORE_PATH = path.join(process.cwd(), ".data", "formgrid-lead-reviews.json");
const APP_STATE_KEY = "formgrid_lead_reviews";

const EMPTY_STORE: LeadReviewStore = { reviews: {} };

async function readFileStore(): Promise<LeadReviewStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as LeadReviewStore;
    if (!data.reviews || typeof data.reviews !== "object") {
      return EMPTY_STORE;
    }
    return data;
  } catch {
    return EMPTY_STORE;
  }
}

async function writeFileStore(store: LeadReviewStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function readLeadReviewStore(): Promise<LeadReviewStore> {
  if (isSupabaseConfigured()) {
    try {
      const value = await getAppState<LeadReviewStore>(APP_STATE_KEY);
      return value?.reviews ? value : EMPTY_STORE;
    } catch (error) {
      console.error("[lead-review] supabase read", error);
      return EMPTY_STORE;
    }
  }
  return readFileStore();
}

export async function writeLeadReviewStore(store: LeadReviewStore): Promise<void> {
  if (isSupabaseConfigured()) {
    const ok = await setAppState(APP_STATE_KEY, store);
    if (!ok) {
      throw new Error("Failed to persist lead reviews");
    }
    return;
  }
  await writeFileStore(store);
}

export async function getLeadReviewByRowKey(
  rowKey: string,
): Promise<LeadReviewRecord | null> {
  const store = await readLeadReviewStore();
  return store.reviews[rowKey] ?? null;
}

export async function upsertLeadReview(
  record: LeadReviewRecord,
): Promise<LeadReviewRecord> {
  const store = await readLeadReviewStore();
  store.reviews[record.rowKey] = record;
  await writeLeadReviewStore(store);
  return record;
}

export function resolveReviewStatus(
  rowKey: string,
  store: LeadReviewStore,
): LeadReviewStatus {
  return store.reviews[rowKey]?.status ?? "new";
}
