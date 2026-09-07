import { AppShell } from "@/components/layout/AppShell";
import { SpioraSurveyLinkPanel } from "@/components/spiora-survey/SpioraSurveyLinkPanel";
import { SPIORA_SURVEY_STAFF_TITLE } from "@/lib/spiora-survey/schema";

export default function SpioraSurveyPage() {
  return (
    <AppShell sectionTitle={SPIORA_SURVEY_STAFF_TITLE}>
      <SpioraSurveyLinkPanel />
    </AppShell>
  );
}
