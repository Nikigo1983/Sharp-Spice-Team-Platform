import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { CaseFinancePanel } from "@/components/finance/CaseFinancePanel";
import { getSession } from "@/lib/auth/session";
import { canViewFinance } from "@/lib/finance/permissions";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function FinanceCasePage({ params }: PageProps) {
  const session = await getSession();
  const { id } = await params;
  const caseId = decodeURIComponent(id);

  if (!session) {
    redirect(`/login?next=/finance/${encodeURIComponent(caseId)}`);
  }
  if (!canViewFinance(session)) redirect("/dashboard");

  return (
    <AppShell sectionTitle="Финансы">
      <CaseFinancePanel caseId={caseId} showHeader />
    </AppShell>
  );
}
