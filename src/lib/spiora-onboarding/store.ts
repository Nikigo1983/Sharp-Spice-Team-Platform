import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAppState, setAppState } from "@/lib/supabase/app-state";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { optionLabel, SPIORA_ONBOARDING_FIELDS } from "./schema";
import type {
  SpioraOnboardingListItem,
  SpioraOnboardingResponse,
  SpioraOnboardingStoreData,
} from "./types";

const STORE_PATH = path.join(process.cwd(), ".data", "spiora-onboarding.json");
const APP_STATE_KEY = "spiora_onboarding_v1";
const EMPTY: SpioraOnboardingStoreData = { responses: [] };

async function readFileStore(): Promise<SpioraOnboardingStoreData> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as SpioraOnboardingStoreData;
    if (!Array.isArray(data.responses)) return structuredClone(EMPTY);
    return { responses: data.responses };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function writeFileStore(store: SpioraOnboardingStoreData): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function readOnboardingStore(): Promise<SpioraOnboardingStoreData> {
  if (isSupabaseConfigured()) {
    try {
      const value = await getAppState<SpioraOnboardingStoreData>(APP_STATE_KEY);
      if (value?.responses && Array.isArray(value.responses)) {
        return { responses: value.responses };
      }
    } catch (error) {
      console.error("[spiora-onboarding] app_state read", error);
    }
  }
  return readFileStore();
}

export async function writeOnboardingStore(
  store: SpioraOnboardingStoreData,
): Promise<void> {
  if (isSupabaseConfigured()) {
    const ok = await setAppState(APP_STATE_KEY, store);
    if (!ok) throw new Error("Failed to persist Spiora onboarding store");
    return;
  }
  await writeFileStore(store);
}

export async function addOnboardingResponse(
  input: Omit<SpioraOnboardingResponse, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<SpioraOnboardingResponse> {
  const store = await readOnboardingStore();
  const record: SpioraOnboardingResponse = {
    id: input.id ?? randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    companyName: input.companyName,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    answers: input.answers,
  };
  store.responses.unshift(record);
  await writeOnboardingStore(store);
  return record;
}

function fieldById(id: string) {
  return SPIORA_ONBOARDING_FIELDS.find((f) => f.id === id);
}

export async function listOnboardingResponses(): Promise<
  SpioraOnboardingListItem[]
> {
  const store = await readOnboardingStore();
  const readiness = fieldById("readiness");
  const goLive = fieldById("go_live");

  return store.responses.map((r) => {
    const readinessId =
      typeof r.answers.readiness === "string" ? r.answers.readiness : null;
    const goLiveId =
      typeof r.answers.go_live === "string" ? r.answers.go_live : null;
    return {
      id: r.id,
      createdAt: r.createdAt,
      companyName: r.companyName,
      contactName: r.contactName,
      contactEmail: r.contactEmail,
      readinessLabel:
        readinessId && readiness
          ? optionLabel(readiness, readinessId)
          : null,
      goLiveLabel:
        goLiveId && goLive ? optionLabel(goLive, goLiveId) : null,
    };
  });
}

export async function getOnboardingResponse(
  id: string,
): Promise<SpioraOnboardingResponse | null> {
  const store = await readOnboardingStore();
  return store.responses.find((r) => r.id === id) ?? null;
}
