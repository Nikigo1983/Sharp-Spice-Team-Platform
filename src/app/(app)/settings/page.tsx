import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { SettingsView } from "@/components/settings/SettingsView";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getSession } from "@/lib/auth/session";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "owner") {
    redirect("/dashboard");
  }

  return (
    <AppShell sectionTitle="Settings">
      <SectionHeader
        title="Настройки"
        subtitle="Управление доступом команды"
      />
      <SettingsView />
    </AppShell>
  );
}
