"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LeadReviewStatusBadge } from "@/components/leads/LeadReviewStatusBadge";
import type { LeadQueueItem, LeadReviewStatus } from "@/lib/leads/lead-review-types";
import { LEAD_REVIEW_STATUS_LABELS } from "@/lib/leads/lead-review-types";
import styles from "./LeadReviewQueue.module.css";

type QueueResponse = {
  items?: LeadQueueItem[];
  source?: string;
  total?: number;
};

const STATUS_FILTERS: Array<LeadReviewStatus | "all"> = [
  "all",
  "new",
  "reviewed",
  "created_in_crm",
  "rejected",
];

export function LeadReviewQueueView() {
  const [items, setItems] = useState<LeadQueueItem[]>([]);
  const [source, setSource] = useState("google_sheets");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadReviewStatus | "all">(
    "all",
  );

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/leads");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as QueueResponse;
      setItems(data.items ?? []);
      setSource(data.source ?? "google_sheets");
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
    const interval = setInterval(() => {
      void fetchQueue();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.reviewStatus !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const hay = [
        item.name,
        item.passport,
        item.phone,
        item.email,
        item.submittedAt,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, statusFilter]);

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <i className={`fa-solid fa-magnifying-glass ${styles.searchIcon}`} />
          <input
            type="search"
            className={styles.search}
            placeholder="Поиск: ФИО, паспорт, телефон, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={
                statusFilter === filter ? styles.filterChipActive : styles.filterChip
              }
              onClick={() => setStatusFilter(filter)}
            >
              {filter === "all"
                ? "Все"
                : LEAD_REVIEW_STATUS_LABELS[filter]}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.meta}>
        {loading ? "Загрузка…" : `${filtered.length} лидов`}
        <span className={styles.source}>
          {source === "google_sheets" ? "Formgrid · Google Sheets" : source}
        </span>
      </p>

      <Card className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Паспорт</th>
                <th>Телефон</th>
                <th>Email</th>
                <th>Дата анкеты</th>
                <th>Источник</th>
                <th>Статус проверки</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    {loading ? "Загрузка очереди…" : "Лиды не найдены"}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link
                        href={`/crm/leads/${item.id}`}
                        className={styles.rowLink}
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td>{item.passport || "—"}</td>
                    <td>{item.phone || "—"}</td>
                    <td>{item.email || "—"}</td>
                    <td>{item.submittedAt || "—"}</td>
                    <td>{item.source}</td>
                    <td>
                      <LeadReviewStatusBadge status={item.reviewStatus} />
                    </td>
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
