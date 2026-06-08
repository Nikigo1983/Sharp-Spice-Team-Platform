import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { NewFormgridClientsList } from "@/components/clients/NewFormgridClientsList";

export default function NewFormgridClientsPage() {
  return (
    <AppShell sectionTitle="Новые клиенты из анкеты">
      <SectionHeader
        title="Новые клиенты из анкеты"
        subtitle="Автосинхронизация с таблицей Formgrid в Google Sheets"
      />
      <NewFormgridClientsList />
    </AppShell>
  );
}
