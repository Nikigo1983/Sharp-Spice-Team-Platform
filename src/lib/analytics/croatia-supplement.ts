import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAppState } from "@/lib/supabase/app-state";

export type VisaDRecord = {
  consulate: string;
  submitted: number;
  approved: number;
  rejected: number;
  avgProcessingDays: number;
  submittedAt?: string;
  decidedAt?: string;
};

export type CroatiaAnalyticsSupplement = {
  visaD: VisaDRecord[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "analytics-croatia-supplement.json");
const APP_STATE_KEY = "analytics_croatia_supplement";

const DEFAULT_SUPPLEMENT: CroatiaAnalyticsSupplement = {
  visaD: [
    {
      consulate: "Посольство Хорватии, Москва",
      submitted: 24,
      approved: 20,
      rejected: 4,
      avgProcessingDays: 38,
    },
    {
      consulate: "Консульство, Санкт-Петербург",
      submitted: 11,
      approved: 9,
      rejected: 2,
      avgProcessingDays: 42,
    },
    {
      consulate: "Консульство, Новосибирск",
      submitted: 6,
      approved: 5,
      rejected: 1,
      avgProcessingDays: 45,
    },
  ],
};

function ensureFile(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(FILE)) {
    writeFileSync(FILE, JSON.stringify(DEFAULT_SUPPLEMENT, null, 2), "utf-8");
  }
}

function getCroatiaSupplementFromFile(): CroatiaAnalyticsSupplement {
  ensureFile();
  try {
    const raw = readFileSync(FILE, "utf-8");
    return JSON.parse(raw) as CroatiaAnalyticsSupplement;
  } catch {
    return DEFAULT_SUPPLEMENT;
  }
}

export async function getCroatiaSupplement(): Promise<CroatiaAnalyticsSupplement> {
  if (isSupabaseConfigured()) {
    try {
      const value = await getAppState<CroatiaAnalyticsSupplement>(APP_STATE_KEY);
      return value ?? DEFAULT_SUPPLEMENT;
    } catch (error) {
      console.error("[analytics] supabase supplement", error);
      return DEFAULT_SUPPLEMENT;
    }
  }

  return getCroatiaSupplementFromFile();
}
