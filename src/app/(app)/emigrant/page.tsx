import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getEmigrantNavChildren } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { CLIENT_PORTAL_BRAND_NAME } from "@/lib/client-portal/brand";
import styles from "@/components/emigrant/EmigrantView.module.css";

export default async function EmigrantPage() {
  const session = await getSession();
  const items = getEmigrantNavChildren(session?.role ?? "manager");

  return (
    <AppShell sectionTitle={CLIENT_PORTAL_BRAND_NAME}>
      <div className={styles.wrap}>
        <SectionHeader
          title={CLIENT_PORTAL_BRAND_NAME}
          subtitle="Клиентский контур Emigrant: CRM, анкеты, финансы и связанные инструменты команды."
        />

        <ul className={styles.grid}>
          {items.map((item) => (
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
