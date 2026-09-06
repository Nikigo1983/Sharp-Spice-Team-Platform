"use client";

import { useCallback, useEffect, useState } from "react";
import { EmigrantLogo } from "@/components/client-portal/EmigrantLogo";
import {
  EMPTY_STAFF_FIELDS,
  STAFF_FIELD_COLUMNS,
  type QuestionnaireStaffFields,
} from "@/lib/client-portal/staff-fields";
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
  staffFields?: QuestionnaireStaffFields;
};

type ReviewRow = {
  section: string;
  label: string;
  value: string;
  questionId?: string;
  fileId?: string;
};

function formatSubmittedAt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

export function ClientPortalIntakePanel() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, QuestionnaireStaffFields>>(
    {},
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [schemaTitle, setSchemaTitle] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
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
      const nextItems = data.items ?? [];
      setItems(nextItems);
      const nextDrafts: Record<string, QuestionnaireStaffFields> = {};
      for (const item of nextItems) {
        nextDrafts[item.id] = {
          ...EMPTY_STAFF_FIELDS,
          ...(item.staffFields ?? {}),
        };
      }
      setDrafts(nextDrafts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  function updateDraft(
    id: string,
    key: keyof QuestionnaireStaffFields,
    value: string,
  ) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? EMPTY_STAFF_FIELDS),
        [key]: value,
      },
    }));
  }

  async function saveRow(id: string) {
    const staffFields = drafts[id] ?? EMPTY_STAFF_FIELDS;
    setSavingId(id);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/client-cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, staffFields }),
      });
      const data = (await res.json()) as {
        item?: ListItem;
        error?: string;
      };
      if (!res.ok || !data.item) {
        setError("Не удалось сохранить изменения.");
        return;
      }
      setItems((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...data.item } : row)),
      );
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          ...EMPTY_STAFF_FIELDS,
          ...(data.item?.staffFields ?? staffFields),
        },
      }));
      setStatus("Сохранено");
    } finally {
      setSavingId(null);
    }
  }

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
    <div className={styles.wrapWide}>
      <header className={styles.header}>
        <div>
          <div className={styles.logoRow}>
            <EmigrantLogo size="md" />
          </div>
          <h1 className={styles.title}>
            Заявки клиентского портала Emigrant
          </h1>
          <p className={styles.lead}>
            Анкеты клиентов. Редактируйте колонки в таблице и нажмите
            «Сохранить». Имя открывает полные ответы анкеты.
          </p>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => void loadList()}
        >
          Обновить
        </button>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {status ? <p className={styles.statusOk}>{status}</p> : null}
      {loading ? <p className={styles.muted}>Загрузка…</p> : null}

      {!loading && items.length === 0 ? (
        <p className={styles.muted}>Пока нет отправленных анкет.</p>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Клиент</th>
                <th>Дата подачи</th>
                {STAFF_FIELD_COLUMNS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const name =
                  item.displayName ||
                  [item.firstName, item.lastName].filter(Boolean).join(" ") ||
                  item.email;
                const draft = drafts[item.id] ?? EMPTY_STAFF_FIELDS;
                return (
                  <tr key={item.id}>
                    <td className={styles.numCell}>{index + 1}</td>
                    <td className={styles.nameCell}>
                      <button
                        type="button"
                        className={styles.nameButton}
                        onClick={() => void openCase(item)}
                      >
                        {name}
                        {item.isNew ? (
                          <span className={styles.newBadge}>Новая</span>
                        ) : null}
                      </button>
                      <span className={styles.emailLine}>{item.email}</span>
                    </td>
                    <td className={styles.dateCell}>
                      {formatSubmittedAt(item.submittedAt)}
                    </td>
                    {STAFF_FIELD_COLUMNS.map((col) => (
                      <td key={col.key}>
                        <input
                          className={styles.cellInput}
                          value={draft[col.key]}
                          onChange={(event) =>
                            updateDraft(item.id, col.key, event.target.value)
                          }
                          aria-label={`${col.label}: ${name}`}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className={styles.saveBtn}
                        disabled={savingId === item.id}
                        onClick={() => void saveRow(item.id)}
                      >
                        {savingId === item.id ? "…" : "Сохранить"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
