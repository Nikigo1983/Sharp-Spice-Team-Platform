import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SPIORA_NAV_CHILDREN } from "@/lib/auth/permissions";
import {
  getSpioraDemoUrl,
  SPIORA_DESCRIPTION,
  SPIORA_PRODUCT_NAME,
  SPIORA_SLOGAN,
} from "@/lib/spiora/brand";
import styles from "./SpioraView.module.css";

export function SpioraView() {
  const demoUrl = getSpioraDemoUrl();

  return (
    <div className={styles.wrap}>
      <SectionHeader
        title={SPIORA_PRODUCT_NAME}
        subtitle={SPIORA_DESCRIPTION}
        action={
          demoUrl ? (
            <a
              href={demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.openLink}
            >
              <Button type="button">Открыть Spiora</Button>
            </a>
          ) : null
        }
      />

      <Card className={styles.hero}>
        <p className={styles.eyebrow}>Product research</p>
        <h2 className={styles.heroTitle}>{SPIORA_PRODUCT_NAME}</h2>
        <p className={styles.slogan}>{SPIORA_SLOGAN}</p>
        <p className={styles.heroLead}>
          Анкеты, ответы и клиенты SPIORA — в одном разделе для команды.
        </p>
        {demoUrl ? (
          <a
            href={demoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.primaryCta}
          >
            Перейти в демо Spiora →
          </a>
        ) : null}
      </Card>

      <ul className={styles.grid}>
        {SPIORA_NAV_CHILDREN.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={styles.navCardLink}>
              <Card className={styles.card}>
                <h3 className={styles.cardTitle}>
                  <i className={item.icon} aria-hidden /> {item.label}
                </h3>
                <p className={styles.cardText}>Открыть раздел →</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
