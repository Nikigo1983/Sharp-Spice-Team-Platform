"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import {
  findFormgridFilterColumns,
} from "@/lib/clients/formgrid-filter-columns";
import {
  dateInRange,
  matchesApprovalFilter,
  matchesPresenceFilter,
  type ApprovalFilter,
  type PresenceFilter,
} from "@/lib/clients/list-filter-utils";
import { downloadCsv, uniqueSortedValues } from "@/lib/export/download-csv";
import { getFormgridSubmissionDate } from "@/lib/google-sheets/formgrid-dates";
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
  const [partner, setPartner] = useState("");
  const [referent, setReferent] = useState("");
  const [contract, setContract] = useState("");
  const [submittedFrom, setSubmittedFrom] = useState("");
  const [submittedTo, setSubmittedTo] = useState("");
  const [hasAmount, setHasAmount] = useState<PresenceFilter>("");
  const [approvalStatus, setApprovalStatus] = useState<ApprovalFilter>("");

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

  const columns = useMemo(() => findFormgridFilterColumns(headers), [headers]);

  const options = useMemo(() => {
    const cell = (index: number | undefined) =>
      index == null
        ? []
        : uniqueSortedValues(rows.map((row) => row[index]));
    return {
      partners: cell(columns.partner),
      referents: cell(columns.referent),
      contracts: cell(columns.contract),
    };
  }, [rows, columns]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !row.some((cell) => (cell ?? "").toLowerCase().includes(q))) {
        return false;
      }
      if (partner && columns.partner != null) {
        if ((row[columns.partner] ?? "").trim() !== partner) return false;
      }
      if (referent && columns.referent != null) {
        if ((row[columns.referent] ?? "").trim() !== referent) return false;
      }
      if (contract && columns.contract != null) {
        if ((row[columns.contract] ?? "").trim() !== contract) return false;
      }
      if (submittedFrom || submittedTo) {
        const submitted = getFormgridSubmissionDate(headers, row);
        const iso = submitted?.toISOString() ?? "";
        if (!dateInRange(iso || null, submittedFrom || undefined, submittedTo || undefined)) {
          return false;
        }
      }
      if (hasAmount && columns.amount != null) {
        if (!matchesPresenceFilter(row[columns.amount], hasAmount)) return false;
      }
      if (approvalStatus && columns.approval != null) {
        if (!matchesApprovalFilter(row[columns.approval], approvalStatus)) {
          return false;
        }
      }
      return true;
    });
  }, [
    rows,
    headers,
    search,
    partner,
    referent,
    contract,
    submittedFrom,
    submittedTo,
    hasAmount,
    approvalStatus,
    columns,
  ]);

  const clearFilters = () => {
    setSearch("");
    setPartner("");
    setReferent("");
    setContract("");
    setSubmittedFrom("");
    setSubmittedTo("");
    setHasAmount("");
    setApprovalStatus("");
  };

  const exportCsv = () => {
    downloadCsv(
      `formgrid-clients-${new Date().toISOString().slice(0, 10)}.csv`,
      headers.map((h, i) => h || `Колонка ${i + 1}`),
      filteredRows,
    );
  };

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
        <div className={styles.filters}>
          <label className={styles.dateField}>
            <span>Подача с</span>
            <input
              type="date"
              className={styles.dateInput}
              value={submittedFrom}
              onChange={(e) => setSubmittedFrom(e.target.value)}
            />
          </label>
          <label className={styles.dateField}>
            <span>по</span>
            <input
              type="date"
              className={styles.dateInput}
              value={submittedTo}
              onChange={(e) => setSubmittedTo(e.target.value)}
            />
          </label>
          {columns.referent != null ? (
            <select
              className={styles.select}
              value={referent}
              onChange={(e) => setReferent(e.target.value)}
              aria-label="Референт"
            >
              <option value="">Все референты</option>
              {options.referents.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          ) : null}
          {columns.partner != null ? (
            <select
              className={styles.select}
              value={partner}
              onChange={(e) => setPartner(e.target.value)}
              aria-label="Партнёр"
            >
              <option value="">Все партнёры</option>
              {options.partners.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          ) : null}
          {columns.contract != null ? (
            <select
              className={styles.select}
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              aria-label="Договор"
            >
              <option value="">Все договоры</option>
              {options.contracts.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          ) : null}
          {columns.amount != null ? (
            <select
              className={styles.select}
              value={hasAmount}
              onChange={(e) => setHasAmount(e.target.value as PresenceFilter)}
              aria-label="Стоимость"
            >
              <option value="">Стоимость: все</option>
              <option value="yes">Есть сумма / оплата</option>
              <option value="no">Без суммы</option>
            </select>
          ) : null}
          {columns.approval != null ? (
            <select
              className={styles.select}
              value={approvalStatus}
              onChange={(e) =>
                setApprovalStatus(e.target.value as ApprovalFilter)
              }
              aria-label="Одобрение"
            >
              <option value="">Одобрение: все</option>
              <option value="approved">Одобрены</option>
              <option value="not_approved">Не одобрены</option>
            </select>
          ) : null}
          <button type="button" className={styles.secondaryBtn} onClick={clearFilters}>
            Сбросить
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={loading || filteredRows.length === 0}
            onClick={exportCsv}
          >
            Выгрузить CSV
          </button>
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
