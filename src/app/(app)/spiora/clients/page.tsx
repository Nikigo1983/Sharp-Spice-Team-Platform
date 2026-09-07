import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import styles from "@/components/spiora/SpioraPlaceholder.module.css";

const TITLE = "Клиенты SPIORA";

export default function SpioraClientsPage() {
  return (
    <AppShell sectionTitle={TITLE}>
      <SectionHeader
        title={TITLE}
        subtitle="Раздел для клиентов, которые внедряют или уже используют SPIORA. Наполнение добавим отдельно."
      />
      <Card className={styles.placeholder}>
        <p className={styles.text}>
          Скоро здесь появится список клиентов SPIORA и карточки дел.
        </p>
      </Card>
    </AppShell>
  );
}
