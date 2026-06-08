"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Client,
  type ClientsListResult,
} from "@/lib/google-sheets/types";
import { Card } from "@/components/ui/Card";
import styles from "./ClientsList.module.css";

const PAGE_SIZE = 25;

export function ClientsList() {
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState<ClientsListResult["source"]>("demo");
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (search) params.set("search", search);
    return params.toString();
  }, [page, search]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients?${queryString}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as ClientsListResult;
      setClients(data.items);
      setTotal(data.total);
      setSource(data.source);
    } catch {
      setClients([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchClients();
    }, search ? 200 : 0);
    return () => clearTimeout(timer);
  }, [fetchClients, search]);

  // Подтягиваем новые записи из Google Sheets с небольшим интервалом.
  // Сервер при этом тоже кэширует на короткое время (см. GOOGLE_SHEETS_CACHE_TTL_MS).
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchClients();
    }, 20_000);
    return () => clearInterval(interval);
  }, [fetchClients]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <i className={`fa-solid fa-magnifying-glass ${styles.searchIcon}`} />
          <input
            type="search"
            className={styles.search}
            placeholder="Поиск: имя, паспорт…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <p className={styles.meta}>
        {loading ? "Загрузка…" : `${total} клиентов`}
        <span className={styles.source}>
          {source === "google_sheets" ? "Google Sheets" : "Демо-данные"}
        </span>
      </p>

      <Card className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Номер паспорта</th>
                <th>Дата подачи</th>
                <th>Дата подачи 2</th>
                <th>Предполагаемое одобрение</th>
                <th>Имя референта</th>
                <th>Адрес букинга</th>
                <th>Дата букинга</th>
                <th>Дата одобрения ВНЖ</th>
                <th>Дата выдачи карточки ВНЖ</th>
                <th>Пароль приложения</th>
                <th>Заметки</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className={styles.empty}>
                    Загрузка клиентов…
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={12} className={styles.empty}>
                    Клиенты не найдены
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <Link
                        href={`/clients/${encodeURIComponent(client.id)}`}
                        className={styles.nameLink}
                      >
                        {client.name}
                      </Link>
                    </td>
                    <td>{client.passportNumber ?? client.id}</td>
                    <td>{client.submittedAt ?? "—"}</td>
                    <td>{client.submittedAt2 ?? "—"}</td>
                    <td>{client.expectedApprovalAt ?? "—"}</td>
                    <td>{client.referentName ?? client.manager}</td>
                    <td>{client.bookingAddress ?? "—"}</td>
                    <td>{client.bookingRange ?? "—"}</td>
                    <td>{client.approvalAt ?? "—"}</td>
                    <td>{client.residenceCardIssuedAt ?? "—"}</td>
                    <td>{client.appPassword ?? "—"}</td>
                    <td>{client.notes ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
