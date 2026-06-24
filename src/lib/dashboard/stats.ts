import "server-only";

import { parseFlexibleDate } from "@/lib/analytics/dates";
import { countFormgridRowsSince } from "@/lib/google-sheets/formgrid-dates";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { listAllClients } from "@/lib/google-sheets/service";
import {
  AI_REQUEST_STATS_DAYS,
  countAiUserMessagesLastDaysForDashboard,
} from "./ai-request-stats";

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
      countAiUserMessagesLastDaysForDashboard(AI_REQUEST_STATS_DAYS),
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
