"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./ClientPortalIntake.module.css";

type ListItem = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  serviceType: string;
  submittedAt: string | null;
};

type ReviewRow = {
  section: string;
  label: string;
  value: string;
  questionId?: string;
  fileId?: string;
};

export function ClientPortalIntakePanel() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [schemaTitle, setSchemaTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/client-cases", { cache: "no-store" });
      if (!res.ok) {
        setError("Не удалось загрузить заявки.");
        return;
      }
      const data = (await res.json()) as { items: ListItem[] };
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function openCase(id: string) {
    setSelectedId(id);
    setError(null);
    const res = await fetch(`/api/client-cases?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      setError("Не удалось открыть анкету.");
      return;
    }
    const data = (await res.json()) as {
      schemaTitle: string;
      review: ReviewRow[];
    };
    setSchemaTitle(data.schemaTitle);
    setReview(data.review ?? []);
  }

  if (selectedId) {
    return (
      <div className={styles.wrap}>
        <button
          type="button"
          className={styles.back}
          onClick={() => {
            setSelectedId(null);
            setReview([]);
          }}
        >
          ← К списку
        </button>
        <h1 className={styles.title}>{schemaTitle || "Анкета клиента"}</h1>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.review}>
          {review.map((row, index) => (
            <div key={`${row.label}-${index}`} className={styles.row}>
              <div className={styles.rowMeta}>
                <span className={styles.section}>{row.section}</span>
                <span className={styles.label}>{row.label}</span>
              </div>
              <div className={styles.value}>
                {row.fileId && selectedId ? (
                  <a
                    href={`/api/client-cases/files/${encodeURIComponent(row.fileId)}?questionnaireId=${encodeURIComponent(selectedId)}`}
                  >
                    {row.value || "Скачать файл"}
                  </a>
                ) : (
                  row.value || "—"
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Заявки клиентского портала</h1>
          <p className={styles.lead}>
            Анкеты, отправленные через новый портал. Formgrid остаётся отдельно:{" "}
            <Link href="/new-formgrid-clients">Новые клиенты из анкеты</Link>.
          </p>
        </div>
        <button type="button" className={styles.refresh} onClick={() => void loadList()}>
          Обновить
        </button>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Загрузка…</p> : null}

      {!loading && items.length === 0 ? (
        <p className={styles.muted}>Пока нет отправленных анкет.</p>
      ) : null}

      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={styles.item}
              onClick={() => void openCase(item.id)}
            >
              <span className={styles.itemTitle}>
                {[item.firstName, item.lastName].filter(Boolean).join(" ") ||
                  item.email}
              </span>
              <span className={styles.itemMeta}>
                {item.email}
                {item.serviceType ? ` · ${item.serviceType}` : ""}
                {item.submittedAt
                  ? ` · ${new Date(item.submittedAt).toLocaleString("ru-RU")}`
                  : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
