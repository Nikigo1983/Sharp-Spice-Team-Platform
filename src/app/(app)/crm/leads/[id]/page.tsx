import { AppShell } from "@/components/layout/AppShell";
import { LeadReviewDetailView } from "@/components/leads/LeadReviewDetailView";
import { SectionHeader } from "@/components/ui/SectionHeader";

type CrmLeadDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CrmLeadDetailPage({
  params,
}: CrmLeadDetailPageProps) {
  const { id } = await params;

  return (
    <AppShell sectionTitle="CRM · Проверка лида">
      <SectionHeader
        title="Проверка лида"
        subtitle="Данные анкеты, дубликаты и действия менеджера"
      />
      <LeadReviewDetailView leadId={id} />
    </AppShell>
  );
}
