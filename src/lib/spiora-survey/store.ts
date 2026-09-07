import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAppState, setAppState } from "@/lib/supabase/app-state";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getQuestionById,
  optionLabel,
} from "./schema";
import type {
  SpioraSurveyListItem,
  SpioraSurveyResponse,
  SpioraSurveyStoreData,
} from "./types";

const STORE_PATH = path.join(process.cwd(), ".data", "spiora-surveys.json");
const APP_STATE_KEY = "spiora_surveys_v1";

const EMPTY: SpioraSurveyStoreData = { responses: [] };

async function readFileStore(): Promise<SpioraSurveyStoreData> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as SpioraSurveyStoreData;
    if (!Array.isArray(data.responses)) {
      return structuredClone(EMPTY);
    }
    return { responses: data.responses };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function writeFileStore(store: SpioraSurveyStoreData): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function readSpioraSurveyStore(): Promise<SpioraSurveyStoreData> {
  if (isSupabaseConfigured()) {
    try {
      const value = await getAppState<SpioraSurveyStoreData>(APP_STATE_KEY);
      if (value?.responses && Array.isArray(value.responses)) {
        return { responses: value.responses };
      }
    } catch (error) {
      console.error("[spiora-survey] app_state read", error);
    }
  }
  return readFileStore();
}

export async function writeSpioraSurveyStore(
  store: SpioraSurveyStoreData,
): Promise<void> {
  if (isSupabaseConfigured()) {
    const ok = await setAppState(APP_STATE_KEY, store);
    if (!ok) {
      throw new Error("Failed to persist Spiora survey store");
    }
    return;
  }
  await writeFileStore(store);
}

export function newSpioraSurveyId(): string {
  return randomUUID();
}

export async function addSpioraSurveyResponse(
  response: Omit<SpioraSurveyResponse, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<SpioraSurveyResponse> {
  const store = await readSpioraSurveyStore();
  const record: SpioraSurveyResponse = {
    id: response.id ?? newSpioraSurveyId(),
    createdAt: response.createdAt ?? new Date().toISOString(),
    anonymous: response.anonymous,
    companyName: response.companyName,
    answers: response.answers,
    contact: response.contact,
  };
  store.responses.unshift(record);
  await writeSpioraSurveyStore(store);
  return record;
}

export async function listSpioraSurveyResponses(): Promise<
  SpioraSurveyListItem[]
> {
  const store = await readSpioraSurveyStore();
  const industryQ = getQuestionById("q1_industry");
  const teamQ = getQuestionById("q2_team_size");
  const contactQ = getQuestionById("q18_contact_ok");

  return store.responses.map((r) => {
    const industryId =
      typeof r.answers.q1_industry === "string" ? r.answers.q1_industry : null;
    const teamId =
      typeof r.answers.q2_team_size === "string" ? r.answers.q2_team_size : null;
    const contactOk =
      typeof r.answers.q18_contact_ok === "string"
        ? r.answers.q18_contact_ok
        : null;
    const painRaw = r.answers.q11_pain_score;
    const painScore =
      typeof painRaw === "number"
        ? painRaw
        : typeof painRaw === "string" && painRaw
          ? Number(painRaw)
          : null;

    return {
      id: r.id,
      createdAt: r.createdAt,
      anonymous: r.anonymous,
      companyName: r.companyName,
      industryLabel:
        industryId && industryQ
          ? industryId === "other"
            ? String(r.answers.q1_industry_other ?? "Другое")
            : optionLabel(industryQ, industryId)
          : null,
      teamSizeLabel:
        teamId && teamQ ? optionLabel(teamQ, teamId) : null,
      painScore: Number.isFinite(painScore) ? painScore : null,
      contactOkLabel:
        contactOk && contactQ ? optionLabel(contactQ, contactOk) : null,
      contactName: r.contact?.name ?? null,
    };
  });
}

export async function getSpioraSurveyResponse(
  id: string,
): Promise<SpioraSurveyResponse | null> {
  const store = await readSpioraSurveyStore();
  return store.responses.find((r) => r.id === id) ?? null;
}
