import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { QuestionnaireRecord } from "./questionnaire-types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sb from "@/lib/supabase/client-portal-repo";

const DATA_DIR = path.join(process.cwd(), ".data");
const PATH = path.join(DATA_DIR, "client-portal-questionnaires.json");

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readAll(): Promise<QuestionnaireRecord[]> {
  try {
    const raw = await readFile(PATH, "utf8");
    return JSON.parse(raw) as QuestionnaireRecord[];
  } catch {
    return [];
  }
}

async function writeAll(records: QuestionnaireRecord[]): Promise<void> {
  await ensureDataDir();
  await writeFile(PATH, JSON.stringify(records, null, 2), "utf8");
}

export async function listQuestionnaires(): Promise<QuestionnaireRecord[]> {
  if (isSupabaseConfigured()) {
    return sb.sbListQuestionnaires();
  }
  return readAll();
}

export async function findQuestionnaireById(
  id: string,
): Promise<QuestionnaireRecord | null> {
  if (isSupabaseConfigured()) {
    return sb.sbFindQuestionnaireById(id);
  }
  const records = await readAll();
  return records.find((item) => item.id === id) ?? null;
}

export async function findQuestionnaireByUserId(
  clientPortalUserId: string,
): Promise<QuestionnaireRecord | null> {
  if (isSupabaseConfigured()) {
    return sb.sbFindQuestionnaireByUserId(clientPortalUserId);
  }
  const records = await readAll();
  return (
    records.find((item) => item.clientPortalUserId === clientPortalUserId) ??
    null
  );
}

export async function upsertQuestionnaire(
  record: QuestionnaireRecord,
): Promise<QuestionnaireRecord> {
  if (isSupabaseConfigured()) {
    return sb.sbUpsertQuestionnaire(record);
  }
  const records = await readAll();
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    records[index] = record;
  } else {
    records.unshift(record);
  }
  await writeAll(records);
  return record;
}

export async function listSubmittedQuestionnaires(): Promise<
  QuestionnaireRecord[]
> {
  if (isSupabaseConfigured()) {
    return sb.sbListSubmittedQuestionnaires();
  }
  const records = await readAll();
  return records
    .filter((item) => item.status === "submitted")
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
}
