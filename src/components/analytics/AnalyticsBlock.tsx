import type { ReactNode } from "react";
import styles from "./AnalyticsBlock.module.css";

type AnalyticsBlockProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  id?: string;
};

export function AnalyticsBlock({
  title,
  subtitle,
  children,
  id,
}: AnalyticsBlockProps) {
  return (
    <section className={styles.block} id={id}>
      <header className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
