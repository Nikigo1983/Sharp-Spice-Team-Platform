import { AppShell } from "@/components/layout/AppShell";
import { SpioraOnboardingClientsPanel } from "@/components/spiora-onboarding/SpioraOnboardingClientsPanel";

export default function SpioraClientsPage() {
  return (
    <AppShell sectionTitle="Клиенты SPIORA">
      <SpioraOnboardingClientsPanel />
    </AppShell>
  );
}
