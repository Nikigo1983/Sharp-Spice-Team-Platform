"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ClientPortalIntake.module.css";

type ListItem = {
  id: string;
  email: string;
  displayName?: string;
  firstName: string;
  lastName: string;
  serviceType: string;
  submittedAt: string | null;
  isNew?: boolean;
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
  const [clientLabel, setClientLabel] = useState("");
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

  async function openCase(item: ListItem) {
    setSelectedId(item.id);
    setClientLabel(
      item.displayName ||
        [item.firstName, item.lastName].filter(Boolean).join(" ") ||
        item.email,
    );
    setError(null);
    const res = await fetch(`/api/client-cases?id=${encodeURIComponent(item.id)}`, {
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
    setItems((prev) =>
      prev.map((row) =>
        row.id === item.id ? { ...row, isNew: false } : row,
      ),
    );
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
            setClientLabel("");
          }}
        >
          ← К списку
        </button>
        <h1 className={styles.title}>{schemaTitle || "Анкета клиента"}</h1>
        {clientLabel ? <p className={styles.lead}>{clientLabel}</p> : null}
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
            Анкеты, отправленные клиентами через портал. Нажмите на имя, чтобы
            открыть все ответы.
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
        {items.map((item) => {
          const name =
            item.displayName ||
            [item.firstName, item.lastName].filter(Boolean).join(" ") ||
            item.email;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={styles.item}
                onClick={() => void openCase(item)}
              >
                <span className={styles.itemTitleRow}>
                  <span className={styles.itemTitle}>{name}</span>
                  {item.isNew ? (
                    <span className={styles.newBadge}>Новая</span>
                  ) : null}
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
          );
        })}
      </ul>
    </div>
  );
}
