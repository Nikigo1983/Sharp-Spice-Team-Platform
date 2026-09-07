"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FinanceClientListItem } from "@/lib/finance/types";
import type {
  FinanceDashboardKpis,
  FinancePaymentStatus,
} from "@/lib/finance/calculations";
import { formatEuroFromCents } from "@/lib/finance/money";
import {
  FINANCE_DIRECTIONS,
  financeDirectionLabelRu,
} from "@/lib/finance/directions";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import styles from "./FinanceDashboard.module.css";

type ClientsResponse = {
  items: FinanceClientListItem[];
  total: number;
  page: number;
  limit: number;
};

const STATUS_LABELS: Record<FinancePaymentStatus, string> = {
  no_contract: "Нет договора",
  unpaid: "Не оплачено",
  partial: "Частично",
  paid: "Оплачено",
  overpaid: "Переплата",
};

const STATUS_STYLE: Record<FinancePaymentStatus, string> = {
  paid: styles.statusPaid,
  partial: styles.statusPartial,
  unpaid: styles.statusUnpaid,
  overpaid: styles.statusOverpaid,
  no_contract: styles.statusNoContract,
};

const TABLE_COLS = [
  { key: "client", label: "Клиент" },
  { key: "direction", label: "Направление" },
  { key: "contract", label: "Договор" },
  { key: "paid", label: "Оплачено" },
  { key: "balance", label: "Остаток" },
  { key: "status", label: "Статус" },
  { key: "lastPayment", label: "Последний платёж" },
] as const;

function fmt(cents: number | null | undefined) {
  return formatEuroFromCents(cents, "ru");
}

export function FinanceDashboard() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<FinanceDashboardKpis | null>(null);
  const [clients, setClients] = useState<FinanceClientListItem[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/finance/summary");
        if (!res.ok) return;
        const data = (await res.json()) as { summary?: FinanceDashboardKpis };
        if (!cancelled) setKpis(data.summary ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    if (search) params.set("search", search);
    if (direction && direction !== "all") params.set("direction", direction);
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    return params.toString();
  }, [page, pageSize, search, direction, paymentStatus]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/clients?${queryString}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as ClientsResponse;
      setClients(data.items);
      setTotal(data.total);
    } catch {
      setClients([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        void fetchClients();
      },
      search ? 200 : 0,
    );
    return () => clearTimeout(timer);
  }, [fetchClients, search]);

  useEffect(() => {
    setPage(1);
  }, [search, direction, paymentStatus, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openCase = useCallback(
    (clientId: string) => {
      router.push(`/finance/${encodeURIComponent(clientId)}`);
    },
    [router],
  );

  return (
    <div className={styles.wrap} aria-busy={loading}>
      <SectionHeader
        title="Финансы"
        subtitle="Договоры и оплаты по заявкам Emigrant"
      />

      <ul className={styles.kpiRow}>
        <li className={styles.kpiCard}>
          <span className={styles.kpiValue}>
            {kpis ? fmt(kpis.totalContractsCents) : "…"}
          </span>
          <span className={styles.kpiLabel}>Сумма договоров</span>
        </li>
        <li className={styles.kpiCard}>
          <span className={styles.kpiValue}>
            {kpis ? fmt(kpis.totalReceivedCents) : "…"}
          </span>
          <span className={styles.kpiLabel}>Получено</span>
        </li>
        <li className={styles.kpiCardEmphasize}>
          <span className={styles.kpiValue}>
            {kpis ? fmt(kpis.totalDebtCents) : "…"}
          </span>
          <span className={styles.kpiLabel}>Задолженность</span>
        </li>
        <li className={styles.kpiCard}>
          <span className={styles.kpiValue}>
            {kpis ? String(kpis.clientsWithDebt) : "…"}
          </span>
          <span className={styles.kpiLabel}>Клиентов с долгом</span>
        </li>
      </ul>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <i className={`fa-solid fa-magnifying-glass ${styles.searchIcon}`} />
          <input
            type="search"
            className={styles.search}
            placeholder="Поиск по имени или email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filters}>
          <select
            className={styles.select}
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            aria-label="Направление"
          >
            <option value="all">Все направления</option>
            {FINANCE_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {financeDirectionLabelRu(d)}
              </option>
            ))}
            <option value="none">Без направления</option>
          </select>
          <select
            className={styles.select}
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            aria-label="Статус оплаты"
          >
            <option value="">Все статусы</option>
            {(
              [
                "no_contract",
                "unpaid",
                "partial",
                "paid",
                "overpaid",
              ] as FinancePaymentStatus[]
            ).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Размер страницы"
          >
            {[20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} на странице
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className={styles.meta}>
        {loading ? "Загрузка…" : `Найдено: ${total}`}
      </p>

      <Card className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {TABLE_COLS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={TABLE_COLS.length} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLS.length} className={styles.empty}>
                    {search || direction !== "all" || paymentStatus
                      ? "Ничего не найдено"
                      : "Пока нет заявок"}
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr
                    key={c.clientExternalId}
                    className={styles.clickableRow}
                    onClick={() => openCase(c.clientExternalId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openCase(c.clientExternalId);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                  >
                    <td className={styles.nameCell}>{c.clientName}</td>
                    <td>
                      {c.directionNormalized
                        ? financeDirectionLabelRu(c.directionNormalized)
                        : c.direction || "—"}
                    </td>
                    <td>{fmt(c.contractAmountCents)}</td>
                    <td>{fmt(c.paidAmountCents)}</td>
                    <td>{fmt(c.balanceCents)}</td>
                    <td>
                      <span
                        className={
                          STATUS_STYLE[c.paymentStatus] ?? styles.statusBadge
                        }
                      >
                        {STATUS_LABELS[c.paymentStatus]}
                      </span>
                    </td>
                    <td>{c.lastPaymentDate ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.mobileList}>
          {loading ? (
            <p className={styles.mobileEmpty}>Загрузка…</p>
          ) : clients.length === 0 ? (
            <p className={styles.mobileEmpty}>
              {search || direction !== "all" || paymentStatus
                ? "Ничего не найдено"
                : "Пока нет заявок"}
            </p>
          ) : (
            <ul className={styles.mobileCards}>
              {clients.map((c) => (
                <li key={c.clientExternalId}>
                  <article
                    className={styles.clientCard}
                    onClick={() => openCase(c.clientExternalId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openCase(c.clientExternalId);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                  >
                    <div className={styles.clientCardHeader}>
                      <h3 className={styles.clientCardName}>{c.clientName}</h3>
                      <span
                        className={
                          STATUS_STYLE[c.paymentStatus] ?? styles.statusBadge
                        }
                      >
                        {STATUS_LABELS[c.paymentStatus]}
                      </span>
                    </div>
                    <dl className={styles.clientCardMeta}>
                      <div className={styles.clientCardRow}>
                        <dt>Договор</dt>
                        <dd>{fmt(c.contractAmountCents)}</dd>
                      </div>
                      <div className={styles.clientCardRow}>
                        <dt>Оплачено</dt>
                        <dd>{fmt(c.paidAmountCents)}</dd>
                      </div>
                      <div className={styles.clientCardRow}>
                        <dt>Остаток</dt>
                        <dd>{fmt(c.balanceCents)}</dd>
                      </div>
                    </dl>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {totalPages > 1 ? (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Назад
          </button>
          <span className={styles.pageInfo}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Далее
          </button>
        </div>
      ) : null}
    </div>
  );
}
