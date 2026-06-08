import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceChatSession } from "@/lib/ai/workspace-chat-types";
import { parseFlexibleDate } from "@/lib/analytics/dates";
import { countFormgridRowsSince } from "@/lib/google-sheets/formgrid-dates";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { listAllClients } from "@/lib/google-sheets/service";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type DashboardStats = {
  clientsTotal: number;
  newFormgridLeads7Days: number;
  activeConsultations: number;
  aiRequestsThisMonth: number;
  sources: {
    clients: "google_sheets" | "demo";
    formgrid: "google_sheets" | "unavailable";
    ai: "workspace_chats" | "unavailable";
  };
};

function daysAgo(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

function startOfWeekMonday(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const weekday = d.getDay();
  const diff = weekday === 0 ? 6 : weekday - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function isOnOrAfter(date: Date, boundary: Date): boolean {
  return date >= boundary;
}

async function countFormgridLeadsLastDays(
  days: number,
): Promise<{ count: number; source: "google_sheets" | "unavailable" }> {
  try {
    const table = await getFormgridLeadsTable();
    if (table.rows.length === 0) {
      return { count: 0, source: "google_sheets" };
    }

    const since = daysAgo(days);
    const count = countFormgridRowsSince(table.headers, table.rows, since);

    return { count, source: "google_sheets" };
  } catch {
    return { count: 0, source: "unavailable" };
  }
}

async function countAiUserMessagesLastDays(days: number): Promise<number> {
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
        for (const message of messages) {
          if (
            message &&
            typeof message === "object" &&
            "role" in message &&
            message.role === "user" &&
            "content" in message &&
            typeof message.content === "string"
          ) {
            total += 1;
          }
        }
      }
      return total;
    } catch (error) {
      console.error("[dashboard] supabase ai count", error);
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
      const sessions = data.sessions ?? [];

      for (const session of sessions) {
        const updated = parseFlexibleDate(session.updatedAt);
        if (!updated || !isOnOrAfter(updated, since)) continue;
        total += session.messages.filter((m) => m.role === "user").length;
      }
    } catch {
      continue;
    }
  }

  return total;
}

function countConsultationsThisWeek(
  clients: Awaited<ReturnType<typeof listAllClients>>["items"],
): number {
  const weekStart = startOfWeekMonday();

  return clients.filter((client) => {
    if (client.status === "Консультация") return true;

    const activity =
      parseFlexibleDate(client.lastActivity) ??
      parseFlexibleDate(client.createdAt) ??
      parseFlexibleDate(client.submittedAt);

    if (!activity || !isOnOrAfter(activity, weekStart)) return false;

    return (
      client.status === "Новый" ||
      client.status === "Консультация" ||
      /консультац/i.test(client.notes ?? "")
    );
  }).length;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [{ items: clients, source: clientsSource }, formgridResult, aiCount] =
    await Promise.all([
      listAllClients(),
      countFormgridLeadsLastDays(7),
      countAiUserMessagesLastDays(30),
    ]);

  return {
    clientsTotal: clients.length,
    newFormgridLeads7Days: formgridResult.count,
    activeConsultations: countConsultationsThisWeek(clients),
    aiRequestsThisMonth: aiCount,
    sources: {
      clients: clientsSource,
      formgrid:
        formgridResult.source === "google_sheets"
          ? "google_sheets"
          : "unavailable",
      ai: "workspace_chats",
    },
  };
}
