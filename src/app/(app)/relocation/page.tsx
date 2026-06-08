import { AppShell } from "@/components/layout/AppShell";
import { RelocationView } from "@/components/relocation/RelocationView";

export default function RelocationPage() {
  return (
    <AppShell sectionTitle="Эмиграция">
      <RelocationView />
    </AppShell>
  );
}
