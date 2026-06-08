import type { ReactNode } from "react";
import styles from "./AnalyticsTable.module.css";

export type AnalyticsColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
};

type AnalyticsTableProps<T> = {
  columns: AnalyticsColumn<T>[];
  rows: T[];
  emptyText?: string;
  getRowKey: (row: T) => string;
};

export function AnalyticsTable<T>({
  columns,
  rows,
  emptyText = "Нет данных",
  getRowKey,
}: AnalyticsTableProps<T>) {
  if (rows.length === 0) {
    return <p className={styles.empty}>{emptyText}</p>;
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={styles[`align_${col.align ?? "left"}`]}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={styles[`align_${col.align ?? "left"}`]}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
