import { AppShell } from "@/components/layout/AppShell";
import { CheckupsView } from "@/components/checkups/CheckupsView";

export default function CheckupsErevanPage() {
  return (
    <AppShell sectionTitle="Чекапы в Ереване">
      <CheckupsView />
    </AppShell>
  );
}
