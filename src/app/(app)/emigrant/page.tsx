import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EMIGRANT_NAV_CHILDREN } from "@/lib/auth/permissions";
import { CLIENT_PORTAL_BRAND_NAME } from "@/lib/client-portal/brand";
import styles from "@/components/emigrant/EmigrantView.module.css";

export default function EmigrantPage() {
  return (
    <AppShell sectionTitle={CLIENT_PORTAL_BRAND_NAME}>
      <div className={styles.wrap}>
        <SectionHeader
          title={CLIENT_PORTAL_BRAND_NAME}
          subtitle="Клиентский контур Emigrant: CRM, анкеты, финансы и связанные инструменты команды."
        />

        <ul className={styles.grid}>
          {EMIGRANT_NAV_CHILDREN.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={styles.cardLink}>
                <Card className={styles.card}>
                  <span className={styles.iconWrap} aria-hidden>
                    <i className={item.icon} />
                  </span>
                  <span className={styles.cardTitle}>{item.label}</span>
                  <span className={styles.cardHint}>Открыть раздел →</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
