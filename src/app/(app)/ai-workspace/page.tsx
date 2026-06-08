import { AppShell } from "@/components/layout/AppShell";
import styles from "@/components/layout/AppShell.module.css";
import { AiWorkspaceView } from "@/components/ai-workspace/AiWorkspaceView";

export default function AiWorkspacePage() {
  return (
    <AppShell
      sectionTitle="AI Workspace"
      contentClassName={styles.contentFullHeight}
    >
      <AiWorkspaceView />
    </AppShell>
  );
}
