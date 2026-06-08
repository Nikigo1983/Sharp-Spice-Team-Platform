import styles from "./SimpleBarChart.module.css";

export type BarSeries = {
  key: string;
  label: string;
  color: string;
};

export type BarChartPoint = {
  label: string;
  values: Record<string, number>;
};

type SimpleBarChartProps = {
  points: BarChartPoint[];
  series: BarSeries[];
  height?: number;
};

export function SimpleBarChart({
  points,
  series,
  height = 200,
}: SimpleBarChartProps) {
  if (points.length === 0) {
    return <p className={styles.empty}>Нет данных для графика</p>;
  }

  const max = Math.max(
    1,
    ...points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0)),
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>
        {series.map((s) => (
          <span key={s.key} className={styles.legendItem}>
            <span className={styles.dot} style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className={styles.chart} style={{ height }}>
        <div className={styles.grid}>
          {points.map((point) => (
            <div key={point.label} className={styles.group}>
              <div className={styles.bars}>
                {series.map((s) => {
                  const value = point.values[s.key] ?? 0;
                  const pct = value > 0 ? Math.max((value / max) * 100, 6) : 0;
                  return (
                    <div key={s.key} className={styles.barCol}>
                      <span className={styles.barValue}>
                        {value > 0 ? value : ""}
                      </span>
                      <div className={styles.barTrack}>
                        <div
                          className={styles.barFill}
                          style={{
                            height: `${pct}%`,
                            background: s.color,
                          }}
                          title={`${s.label}: ${value}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <span className={styles.label}>{point.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
