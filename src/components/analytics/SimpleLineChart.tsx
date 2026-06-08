import styles from "./SimpleLineChart.module.css";

export type LineChartPoint = {
  label: string;
  value: number | null;
};

type SimpleLineChartProps = {
  points: LineChartPoint[];
  color?: string;
  height?: number;
  unit?: string;
};

export function SimpleLineChart({
  points,
  color = "#e57373",
  height = 200,
  unit = "дн.",
}: SimpleLineChartProps) {
  const values = points
    .map((p) => p.value)
    .filter((v): v is number => v !== null);

  if (values.length === 0) {
    return <p className={styles.empty}>Нет данных для графика</p>;
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  return (
    <div className={styles.wrap}>
      <div className={styles.chart} style={{ height }}>
        <div className={styles.grid}>
          {points.map((point) => {
            const hasValue = point.value !== null;
            const pct = hasValue
              ? ((point.value! - min) / range) * 100
              : 0;
            const barPct = hasValue ? Math.max(pct, 8) : 0;

            return (
              <div key={point.label} className={styles.column}>
                <span className={styles.value}>
                  {hasValue ? Math.round(point.value!) : "—"}
                </span>
                <div className={styles.track}>
                  {hasValue ? (
                    <div
                      className={styles.bar}
                      style={{
                        height: `${barPct}%`,
                        background: color,
                      }}
                      title={`${point.label}: ${Math.round(point.value!)} ${unit}`}
                    />
                  ) : (
                    <span className={styles.noData}>—</span>
                  )}
                </div>
                <span className={styles.label}>{point.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <span className={styles.unit}>Единица: {unit}</span>
    </div>
  );
}
