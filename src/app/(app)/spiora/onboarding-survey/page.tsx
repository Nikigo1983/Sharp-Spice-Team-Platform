import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import styles from "@/components/spiora/SpioraPlaceholder.module.css";

const TITLE = "Анкета для нового клиента SPIORA по внедрению платформы";

export default function SpioraOnboardingSurveyPage() {
  return (
    <AppShell sectionTitle={TITLE}>
      <SectionHeader
        title={TITLE}
        subtitle="Раздел для анкеты клиентов, которые уже решили внедрять SPIORA. Наполнение добавим отдельно."
      />
      <Card className={styles.placeholder}>
        <p className={styles.text}>
          Скоро здесь появятся ссылка для клиента и форма внедрения платформы.
        </p>
      </Card>
    </AppShell>
  );
}
