import styles from "./KpiGrid.module.css";

export type KpiItem = {
  label: string;
  value: string;
  hint?: string;
  icon?: string;
};

type KpiGridProps = {
  items: KpiItem[];
  columns?: 3 | 4 | 6;
};

export function KpiGrid({ items, columns = 4 }: KpiGridProps) {
  return (
    <ul
      className={styles.grid}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <li key={item.label} className={styles.card}>
          {item.icon ? (
            <span className={styles.icon} aria-hidden>
              <i className={item.icon} />
            </span>
          ) : null}
          <div className={styles.body}>
            <span className={styles.value}>{item.value}</span>
            <span className={styles.label}>{item.label}</span>
            {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
