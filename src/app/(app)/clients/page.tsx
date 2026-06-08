import { AppShell } from "@/components/layout/AppShell";
import { ClientsList } from "@/components/clients/ClientsList";
import { SectionHeader } from "@/components/ui/SectionHeader";

export default function ClientsPage() {
  return (
    <AppShell sectionTitle="Клиенты">
      <SectionHeader
        title="Клиенты"
        subtitle="Данные из Google Sheets — без дублирования в локальную БД"
      />
      <ClientsList />
    </AppShell>
  );
}
