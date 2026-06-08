import { AppShell } from "@/components/layout/AppShell";
import { KnowledgeBaseView } from "@/components/knowledge-base/KnowledgeBaseView";
import { SectionHeader } from "@/components/ui/SectionHeader";

export default function KnowledgeBasePage() {
  return (
    <AppShell sectionTitle="Knowledge Base">
      <SectionHeader
        title="Knowledge Base"
        subtitle="База знаний из Google Drive — папки и файлы без загрузки на платформу"
      />
      <KnowledgeBaseView />
    </AppShell>
  );
}
