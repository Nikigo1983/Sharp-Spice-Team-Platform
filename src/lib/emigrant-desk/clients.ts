import "server-only";

import type { EmigrantDeskContextSlice } from "@/lib/ai/client-field-sources";
import {
  scorePersonName,
  tokenizeSearchQuery,
} from "@/lib/ai/name-matching";
import { isEmigrantDeskConfigured } from "./config";
import { getEmigrantDeskAdmin } from "./server";
import type { EmigrantDeskClient } from "./types";

const MAX_CLIENTS = 300;

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
};

type CaseRow = {
  client_id: string;
  current_status: string | null;
  case_number: string | null;
  consulate: string | null;
  submission_city: string | null;
  submission_date: string | null;
  status_updated_at: string | null;
  internal_comment: string | null;
};

function mapClient(profile: ProfileRow, caseRow?: CaseRow): EmigrantDeskClient {
  return {
    id: profile.user_id,
    firstName: profile.first_name,
    lastName: profile.last_name,
    email: profile.email,
    currentStatus: caseRow?.current_status ?? null,
    caseNumber: caseRow?.case_number ?? null,
    consulate: caseRow?.consulate ?? null,
    submissionCity: caseRow?.submission_city ?? null,
    submissionDate: caseRow?.submission_date ?? null,
    statusUpdatedAt: caseRow?.status_updated_at ?? null,
    internalComment: caseRow?.internal_comment ?? null,
  };
}

function fullName(client: EmigrantDeskClient): string {
  return [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
}

export async function listEmigrantDeskClients(): Promise<EmigrantDeskClient[]> {
  if (!isEmigrantDeskConfigured()) {
    return [];
  }

  const supabase = getEmigrantDeskAdmin();
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, first_name, last_name, email")
    .eq("role", "client")
    .order("created_at", { ascending: false })
    .limit(MAX_CLIENTS);

  if (profilesError) {
    console.error("[emigrant-desk] profiles", profilesError.message);
    throw profilesError;
  }

  const clientProfiles = (profiles ?? []) as ProfileRow[];
  if (clientProfiles.length === 0) {
    return [];
  }

  const clientIds = clientProfiles.map((profile) => profile.user_id);
  const { data: cases, error: casesError } = await supabase
    .from("cases")
    .select(
      "client_id, current_status, case_number, consulate, submission_city, submission_date, status_updated_at, internal_comment",
    )
    .in("client_id", clientIds);

  if (casesError) {
    console.error("[emigrant-desk] cases", casesError.message);
    throw casesError;
  }

  const caseMap = new Map(
    ((cases ?? []) as CaseRow[]).map((caseRow) => [caseRow.client_id, caseRow]),
  );

  return clientProfiles.map((profile) =>
    mapClient(profile, caseMap.get(profile.user_id)),
  );
}

function scoreClient(client: EmigrantDeskClient, tokens: string[]): number {
  const nameScore = scorePersonName(
    client.firstName,
    client.lastName,
    tokens,
  );
  if (nameScore > 0) return nameScore;

  const hay = [
    client.email,
    client.currentStatus ?? "",
    client.caseNumber ?? "",
    client.consulate ?? "",
    client.internalComment ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return tokens.reduce((score, token) => {
    if (token.length >= 4 && hay.includes(token)) return score + 2;
    return score;
  }, 0);
}

export function emigrantDeskClientToContextSlice(
  client: EmigrantDeskClient,
): EmigrantDeskContextSlice {
  return {
    name: fullName(client) || client.email,
    email: client.email,
    caseNumber: client.caseNumber ?? "",
    currentStatus: client.currentStatus ?? "",
    consulate: client.consulate ?? "",
    submissionCity: client.submissionCity ?? "",
    submissionDate: client.submissionDate ?? "",
    statusUpdatedAt: client.statusUpdatedAt ?? "",
    internalComment: client.internalComment ?? "",
  };
}

export async function findEmigrantDeskClientByQuery(
  userQuery: string,
): Promise<EmigrantDeskClient | null> {
  if (!isEmigrantDeskConfigured()) return null;

  const tokens = tokenizeSearchQuery(userQuery);
  if (tokens.length === 0) return null;

  const clients = await listEmigrantDeskClients();
  let best: { client: EmigrantDeskClient; score: number } | null = null;

  for (const client of clients) {
    const score = scoreClient(client, tokens);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { client, score };
    }
  }

  return best?.client ?? null;
}

function formatClientLine(client: EmigrantDeskClient, detailed: boolean): string {
  const name = fullName(client) || client.email;
  const parts = [
    `- ${name}`,
    `email: ${client.email}`,
    `статус дела: ${client.currentStatus ?? "—"}`,
  ];

  if (client.caseNumber) parts.push(`№ дела: ${client.caseNumber}`);
  if (client.consulate) parts.push(`консульство: ${client.consulate}`);
  if (client.submissionCity) parts.push(`город подачи: ${client.submissionCity}`);
  if (client.submissionDate) parts.push(`дата подачи: ${client.submissionDate}`);
  if (client.statusUpdatedAt) {
    parts.push(`статус обновлён: ${client.statusUpdatedAt.slice(0, 10)}`);
  }

  if (detailed && client.internalComment?.trim()) {
    parts.push(`внутр. комментарий: ${client.internalComment.trim()}`);
  }

  return parts.join(" | ");
}

export async function buildEmigrantDeskContextForAi(
  userQuery: string,
): Promise<{ text: string; count: number }> {
  if (!isEmigrantDeskConfigured()) {
    return {
      text: "Emigrant Croatia Desk: не подключён (нужны EMIGRANT_SUPABASE_URL и EMIGRANT_SUPABASE_SERVICE_ROLE_KEY).",
      count: 0,
    };
  }

  try {
    const clients = await listEmigrantDeskClients();
    const tokens = tokenizeSearchQuery(userQuery);

    const ranked = [...clients].sort(
      (a, b) => scoreClient(b, tokens) - scoreClient(a, tokens),
    );

    const selected =
      tokens.length === 0
        ? ranked.slice(0, 15)
        : ranked.some((client) => scoreClient(client, tokens) > 0)
          ? ranked.filter((client) => scoreClient(client, tokens) > 0).slice(0, 8)
          : ranked.slice(0, 12);

    const detailed =
      selected.length <= 3 ||
      tokens.some((token) =>
        ["статус", "дело", "консульств", "внж", "виза"].some((keyword) =>
          token.includes(keyword),
        ),
      );

    const lines = selected.map((client) => formatClientLine(client, detailed));
    const header =
      `Клиенты Emigrant Croatia Desk (статусы дел в кабинете emigrant-croatia-desk.vercel.app): всего ${clients.length}, в контексте ${lines.length}.`;

    return {
      text: `${header}\n${lines.join("\n")}`,
      count: clients.length,
    };
  } catch (error) {
    console.error("[emigrant-desk] context", error);
    return {
      text: "Emigrant Croatia Desk: не удалось загрузить клиентов и статусы дел.",
      count: 0,
    };
  }
}
