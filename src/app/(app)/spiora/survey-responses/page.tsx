import { AppShell } from "@/components/layout/AppShell";
import { SpioraSurveyResponsesPanel } from "@/components/spiora-survey/SpioraSurveyResponsesPanel";

export default function SpioraSurveyResponsesPage() {
  return (
    <AppShell sectionTitle="Ответы по анкете SPIORA">
      <SpioraSurveyResponsesPanel />
    </AppShell>
  );
}
