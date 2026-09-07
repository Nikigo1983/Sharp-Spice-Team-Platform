import { AppShell } from "@/components/layout/AppShell";
import { SpioraOnboardingLinkPanel } from "@/components/spiora-onboarding/SpioraOnboardingLinkPanel";
import { SPIORA_ONBOARDING_STAFF_TITLE } from "@/lib/spiora-onboarding/schema";

export default function SpioraOnboardingSurveyPage() {
  return (
    <AppShell sectionTitle={SPIORA_ONBOARDING_STAFF_TITLE}>
      <SpioraOnboardingLinkPanel />
    </AppShell>
  );
}
