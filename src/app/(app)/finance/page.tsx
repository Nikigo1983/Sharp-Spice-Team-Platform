import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { FinanceDashboard } from "@/components/finance/FinanceDashboard";
import { getSession } from "@/lib/auth/session";
import { canViewFinance } from "@/lib/finance/permissions";

export default async function FinancePage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/finance");
  if (!canViewFinance(session)) redirect("/dashboard");

  return (
    <AppShell sectionTitle="Финансы">
      <FinanceDashboard />
    </AppShell>
  );
}
