"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import styles from "./NewFormgridClientsList.module.css";

type LeadsTableResult = {
  headers: string[];
  rows: string[][];
  source: "google_sheets" | "demo";
};

export function NewFormgridClientsList() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [source, setSource] = useState<LeadsTableResult["source"]>("google_sheets");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchTable = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/formgrid-leads");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as LeadsTableResult;
      setHeaders(data.headers);
      setRows(data.rows);
      setSource(data.source);
    } catch {
      setHeaders([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTable();
    const interval = setInterval(() => {
      void fetchTable();
    }, 20_000);
    return () => clearInterval(interval);
  }, [fetchTable]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      row.some((cell) => (cell ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const colSpan = Math.max(1, headers.length);

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <i className={`fa-solid fa-magnifying-glass ${styles.searchIcon}`} />
          <input
            type="search"
            className={styles.search}
            placeholder="Поиск по всем полям анкеты…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <p className={styles.meta}>
        {loading ? "Загрузка…" : `${filteredRows.length} записей`}
        <span className={styles.source}>
          {source === "google_sheets" ? "Google Sheets" : "Демо-данные"}
        </span>
      </p>

      <Card className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {headers.map((header, index) => (
                  <th key={`${header}-${index}`}>{header || `Колонка ${index + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colSpan} className={styles.empty}>
                    Загрузка данных Formgrid…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className={styles.empty}>
                    Записи не найдены
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {headers.map((_, colIndex) => (
                      <td key={`cell-${rowIndex}-${colIndex}`}>
                        {(row[colIndex] ?? "").trim() || "—"}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
