"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Client,
  type ClientsListResult,
} from "@/lib/google-sheets/types";
import { Card } from "@/components/ui/Card";
import styles from "./ClientsList.module.css";

const PAGE_SIZE = 25;

type FilterOptions = {
  referents: string[];
  partners: string[];
  contracts: string[];
};

export function ClientsList() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState<ClientsListResult["source"]>("demo");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState("");
  const [referent, setReferent] = useState("");
  const [partner, setPartner] = useState("");
  const [contract, setContract] = useState("");
  const [submittedFrom, setSubmittedFrom] = useState("");
  const [submittedTo, setSubmittedTo] = useState("");
  const [approvalStatus, setApprovalStatus] = useState("");
  const [hasContract, setHasContract] = useState("");
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    referents: [],
    partners: [],
    contracts: [],
  });

  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (referent) params.set("referent", referent);
    if (partner) params.set("partner", partner);
    if (contract) params.set("contract", contract);
    if (submittedFrom) params.set("submittedFrom", submittedFrom);
    if (submittedTo) params.set("submittedTo", submittedTo);
    if (approvalStatus) params.set("approvalStatus", approvalStatus);
    if (hasContract) params.set("hasContract", hasContract);
    return params;
  }, [
    search,
    referent,
    partner,
    contract,
    submittedFrom,
    submittedTo,
    approvalStatus,
    hasContract,
  ]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams(filterParams);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  }, [page, filterParams]);

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
    void fetch("/api/clients/filters")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FilterOptions | null) => {
        if (!data) return;
        setFilterOptions({
          referents: data.referents ?? [],
          partners: data.partners ?? [],
          contracts: data.contracts ?? [],
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchClients();
    }, search ? 200 : 0);
    return () => clearTimeout(timer);
  }, [fetchClients, search]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchClients();
    }, 20_000);
    return () => clearInterval(interval);
  }, [fetchClients]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    referent,
    partner,
    contract,
    submittedFrom,
    submittedTo,
    approvalStatus,
    hasContract,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openClient = useCallback(
    (clientId: string) => {
      router.push(`/clients/${encodeURIComponent(clientId)}`);
    },
    [router],
  );

  const clearFilters = () => {
    setSearch("");
    setReferent("");
    setPartner("");
    setContract("");
    setSubmittedFrom("");
    setSubmittedTo("");
    setApprovalStatus("");
    setHasContract("");
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/clients/export?${filterParams.toString()}`);
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `clients-export-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore — user can retry
    } finally {
      setExporting(false);
    }
  };

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
          <select
            className={styles.select}
            value={referent}
            onChange={(e) => setReferent(e.target.value)}
            aria-label="Референт"
          >
            <option value="">Все референты</option>
            {filterOptions.referents.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            aria-label="Партнёр"
          >
            <option value="">Все партнёры</option>
            {filterOptions.partners.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            aria-label="Договор"
          >
            <option value="">Все договоры</option>
            {filterOptions.contracts.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={hasContract}
            onChange={(e) => setHasContract(e.target.value)}
            aria-label="Наличие договора"
          >
            <option value="">Договор: все</option>
            <option value="yes">Есть договор</option>
            <option value="no">Без договора</option>
          </select>
          <select
            className={styles.select}
            value={approvalStatus}
            onChange={(e) => setApprovalStatus(e.target.value)}
            aria-label="Одобрение ВНЖ"
          >
            <option value="">Одобрение: все</option>
            <option value="approved">Одобрены</option>
            <option value="not_approved">Ещё не одобрены</option>
          </select>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={clearFilters}
          >
            Сбросить
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={exporting || loading}
            onClick={() => void exportCsv()}
          >
            {exporting ? "Выгрузка…" : "Выгрузить CSV"}
          </button>
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
                <th>Латиница</th>
                <th>Номер паспорта</th>
                <th>Электронная почта</th>
                <th>Дата подачи</th>
                <th>Предполагаемое одобрение</th>
                <th>Имя референта</th>
                <th>Адрес букинга</th>
                <th>Дата букинга</th>
                <th>Дата одобрения ВНЖ</th>
                <th>Дата выдачи карточки ВНЖ</th>
                <th>Пароль приложения</th>
                <th>Партнер от кого клиент</th>
                <th>Договор</th>
                <th>Заметки</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={15} className={styles.empty}>
                    Загрузка клиентов…
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={15} className={styles.empty}>
                    Клиенты не найдены
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr
                    key={client.id}
                    className={styles.clickableRow}
                    onClick={() => openClient(client.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openClient(client.id);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Открыть карточку клиента ${client.name}`}
                  >
                    <td>
                      <Link
                        href={`/clients/${encodeURIComponent(client.id)}`}
                        className={styles.nameLink}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {client.name}
                      </Link>
                    </td>
                    <td>{client.citizenship ?? "—"}</td>
                    <td>{client.passportNumber ?? client.id}</td>
                    <td>{client.email ?? "—"}</td>
                    <td>{client.submittedAt ?? "—"}</td>
                    <td>{client.expectedApprovalAt ?? "—"}</td>
                    <td>{client.referentName ?? client.manager}</td>
                    <td>{client.bookingAddress ?? "—"}</td>
                    <td>{client.bookingRange ?? "—"}</td>
                    <td>{client.approvalAt ?? "—"}</td>
                    <td>{client.residenceCardIssuedAt ?? "—"}</td>
                    <td>{client.appPassword ?? "—"}</td>
                    <td>{client.partnerName ?? "—"}</td>
                    <td>{client.contract ?? "—"}</td>
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
            Вперёд
          </button>
        </div>
      ) : null}
    </div>
  );
}
