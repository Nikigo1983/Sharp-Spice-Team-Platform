import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

export default function SettingsPage() {
  return (
    <AppShell sectionTitle="Settings">
      <SectionHeader
        title="Settings"
        subtitle="Настройки системы, интеграции и API (только Owner)"
      />
      <Card style={{ padding: "1.5rem", color: "var(--gray-300)" }}>
        Раздел в разработке.
      </Card>
    </AppShell>
  );
}
