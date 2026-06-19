import { AppShell } from "@/components/layout/AppShell";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getSession } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/dashboard/stats";
import { getTaskStats } from "@/lib/tasks/store";
import { listLatestTeamChatForDashboard } from "@/lib/team-chat/store";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [taskStats, teamRecentMessages, dashboardStats] = await Promise.all([
    getTaskStats(session),
    listLatestTeamChatForDashboard(5),
    getDashboardStats(),
  ]);

  return (
    <AppShell sectionTitle="Dashboard">
      <DashboardView
        user={session}
        taskStats={taskStats}
        teamRecentMessages={teamRecentMessages}
        dashboardStats={dashboardStats}
      />
    </AppShell>
  );
}
