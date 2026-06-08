import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { getSession } from "@/lib/auth/session";

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/dashboard");

  return (
    <AppShell sectionTitle="Analytics">
      <AnalyticsView />
    </AppShell>
  );
}
