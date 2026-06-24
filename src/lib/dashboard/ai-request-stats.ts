import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceChatSession } from "@/lib/ai/workspace-chat-types";
import { parseFlexibleDate } from "@/lib/analytics/dates";
import { listTeamUsers } from "@/lib/auth/users";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const AI_REQUEST_STATS_DAYS = 30;

function daysAgo(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

function isOnOrAfter(date: Date, boundary: Date): boolean {
  return date >= boundary;
}

export function isUserChatMessage(message: unknown): message is {
  role: "user";
  content: string;
} {
  return (
    !!message &&
    typeof message === "object" &&
    "role" in message &&
    message.role === "user" &&
    "content" in message &&
    typeof message.content === "string"
  );
}

export function countUserRoleMessages(messages: unknown[]): number {
  let total = 0;
  for (const message of messages) {
    if (isUserChatMessage(message)) {
      total += 1;
    }
  }
  return total;
}

export function countUserMessagesInSessionsSince(
  sessions: Pick<WorkspaceChatSession, "updatedAt" | "messages">[],
  since: Date,
): number {
  let total = 0;

  for (const session of sessions) {
    const updated =
      parseFlexibleDate(session.updatedAt) ?? new Date(session.updatedAt);
    if (Number.isNaN(updated.getTime()) || !isOnOrAfter(updated, since)) {
      continue;
    }
    total += countUserRoleMessages(session.messages);
  }

  return total;
}

function emptyCounts(userIds: string[]): Record<string, number> {
  return Object.fromEntries(userIds.map((userId) => [userId, 0]));
}

async function countAiUserMessagesByUserIdFromSupabase(
  since: Date,
  userIds: string[],
): Promise<Record<string, number>> {
  const counts = emptyCounts(userIds);
  const allowed = new Set(userIds);

  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/server");
    const { data, error } = await getSupabaseAdmin()
      .from("ai_workspace_chats")
      .select("user_id, messages, updated_at")
      .in("user_id", userIds);

    if (error) throw error;

    for (const row of data ?? []) {
      const userId = String(row.user_id);
      if (!allowed.has(userId)) continue;

      const updatedAt = new Date(String(row.updated_at));
      if (Number.isNaN(updatedAt.getTime()) || updatedAt < since) continue;

      const messages = Array.isArray(row.messages) ? row.messages : [];
      counts[userId] = (counts[userId] ?? 0) + countUserRoleMessages(messages);
    }
  } catch (error) {
    console.error("[ai-request-stats] supabase count", error);
  }

  return counts;
}

async function countAiUserMessagesByUserIdFromFiles(
  since: Date,
  userIds: string[],
): Promise<Record<string, number>> {
  const counts = emptyCounts(userIds);
  const dir = path.join(process.cwd(), ".data", "ai-workspace-chats");

  for (const userId of userIds) {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = path.join(dir, `${safe}.json`);

    try {
      const raw = await readFile(filePath, "utf8");
      const data = JSON.parse(raw) as { sessions?: WorkspaceChatSession[] };
      counts[userId] = countUserMessagesInSessionsSince(
        data.sessions ?? [],
        since,
      );
    } catch {
      counts[userId] = 0;
    }
  }

  return counts;
}

export async function countAiUserMessagesByUserId(
  days: number = AI_REQUEST_STATS_DAYS,
  userIds: string[] = listTeamUsers().map((user) => user.id),
): Promise<Record<string, number>> {
  const since = daysAgo(days);

  if (isSupabaseConfigured()) {
    return countAiUserMessagesByUserIdFromSupabase(since, userIds);
  }

  return countAiUserMessagesByUserIdFromFiles(since, userIds);
}

export async function countAiUserMessagesLastDays(
  days: number = AI_REQUEST_STATS_DAYS,
): Promise<number> {
  const counts = await countAiUserMessagesByUserId(days);
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

async function countAiUserMessagesLastDaysLegacyTotal(
  days: number,
): Promise<number> {
  const since = daysAgo(days);

  if (isSupabaseConfigured()) {
    try {
      const { getSupabaseAdmin } = await import("@/lib/supabase/server");
      const { data, error } = await getSupabaseAdmin()
        .from("ai_workspace_chats")
        .select("messages, updated_at");

      if (error) throw error;

      let total = 0;
      for (const row of data ?? []) {
        const updatedAt = new Date(String(row.updated_at));
        if (Number.isNaN(updatedAt.getTime()) || updatedAt < since) continue;
        const messages = Array.isArray(row.messages) ? row.messages : [];
        total += countUserRoleMessages(messages);
      }
      return total;
    } catch (error) {
      console.error("[ai-request-stats] supabase total count", error);
      return 0;
    }
  }

  const dir = path.join(process.cwd(), ".data", "ai-workspace-chats");
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return 0;
  }

  let total = 0;

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(dir, file), "utf8");
      const data = JSON.parse(raw) as { sessions?: WorkspaceChatSession[] };
      total += countUserMessagesInSessionsSince(data.sessions ?? [], since);
    } catch {
      continue;
    }
  }

  return total;
}

/** Same total as legacy dashboard query (all chats in table). */
export async function countAiUserMessagesLastDaysForDashboard(
  days: number = AI_REQUEST_STATS_DAYS,
): Promise<number> {
  return countAiUserMessagesLastDaysLegacyTotal(days);
}
