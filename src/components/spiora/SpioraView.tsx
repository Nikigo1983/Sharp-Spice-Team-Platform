import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  getSpioraDemoUrl,
  SPIORA_DESCRIPTION,
  SPIORA_HIGHLIGHTS,
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
        <p className={styles.eyebrow}>Product demo</p>
        <h2 className={styles.heroTitle}>{SPIORA_PRODUCT_NAME}</h2>
        <p className={styles.slogan}>{SPIORA_SLOGAN}</p>
        <p className={styles.heroLead}>
          Раздел для команды Sharp & Spice: быстрый доступ к демо-платформе
          Spiora и напоминание, чем она отличается от рабочего контура.
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
        ) : (
          <p className={styles.envHint}>
            Чтобы появилась кнопка перехода, задайте{" "}
            <code>NEXT_PUBLIC_SPIORA_URL</code> в окружении Vercel.
          </p>
        )}
      </Card>

      <ul className={styles.grid}>
        {SPIORA_HIGHLIGHTS.map((item) => (
          <li key={item.title}>
            <Card className={styles.card}>
              <h3 className={styles.cardTitle}>{item.title}</h3>
              <p className={styles.cardText}>{item.text}</p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
