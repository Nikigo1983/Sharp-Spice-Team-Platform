import { AppShell } from "@/components/layout/AppShell";
import { SpioraView } from "@/components/spiora/SpioraView";

export default function SpioraPage() {
  return (
    <AppShell sectionTitle="Spiora">
      <SpioraView />
    </AppShell>
  );
}
