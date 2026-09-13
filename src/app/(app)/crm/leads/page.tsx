import { AppShell } from "@/components/layout/AppShell";
import { LeadReviewQueueView } from "@/components/leads/LeadReviewQueueView";
import { SectionHeader } from "@/components/ui/SectionHeader";

export default function CrmLeadsPage() {
  return (
    <AppShell sectionTitle="CRM · Новые лиды">
      <SectionHeader
        title="Новые лиды"
        subtitle="Lead Review Queue — проверка анкет Formgrid перед созданием клиента в CRM"
      />
      <LeadReviewQueueView />
    </AppShell>
  );
}
