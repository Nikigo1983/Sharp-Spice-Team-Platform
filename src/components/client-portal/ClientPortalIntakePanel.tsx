"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

type StaffNote = {
  id: string;
  text: string;
  authorName: string;
  authorUserId: string;
  createdAt: string;
};

type StaffDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string;
  uploadedByUserId: string;
  createdAt: string;
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

function caseFileUrl(
  fileId: string,
  questionnaireId: string,
  mode: "open" | "download",
): string {
  const params = new URLSearchParams({
    questionnaireId,
    disposition: mode === "download" ? "attachment" : "inline",
  });
  return `/api/client-cases/files/${encodeURIComponent(fileId)}?${params.toString()}`;
}

function formatSubmittedAt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function clientName(item: ListItem): string {
  return (
    item.displayName ||
    [item.firstName, item.lastName].filter(Boolean).join(" ") ||
    item.email
  );
}

function rowMatchesQuery(
  item: ListItem,
  draft: QuestionnaireStaffFields,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    clientName(item),
    item.email,
    item.firstName,
    item.lastName,
    item.serviceType,
    formatSubmittedAt(item.submittedAt),
    ...STAFF_FIELD_COLUMNS.map((col) => draft[col.key]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function ClientPortalIntakePanel() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, QuestionnaireStaffFields>>(
    {},
  );
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [documents, setDocuments] = useState<StaffDocument[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
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

  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        rowMatchesQuery(item, drafts[item.id] ?? EMPTY_STAFF_FIELDS, query),
      ),
    [items, drafts, query],
  );

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
    setClientLabel(clientName(item));
    setError(null);
    setStatus(null);
    setNoteDraft("");
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
      notes?: StaffNote[];
      documents?: StaffDocument[];
    };
    setSchemaTitle(data.schemaTitle);
    setReview(data.review ?? []);
    setNotes(data.notes ?? []);
    setDocuments(data.documents ?? []);
    setItems((prev) =>
      prev.map((row) =>
        row.id === item.id ? { ...row, isNew: false } : row,
      ),
    );
  }

  async function submitNote() {
    if (!selectedId || !noteDraft.trim()) return;
    setSavingNote(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/client-cases/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionnaireId: selectedId,
          text: noteDraft,
        }),
      });
      const data = (await res.json()) as {
        notes?: StaffNote[];
        error?: string;
      };
      if (!res.ok) {
        setError("Не удалось сохранить комментарий.");
        return;
      }
      setNotes(data.notes ?? []);
      setNoteDraft("");
      setStatus("Комментарий добавлен");
    } finally {
      setSavingNote(false);
    }
  }

  async function uploadDocument(file: File | null) {
    if (!selectedId || !file) return;
    setUploadingDoc(true);
    setError(null);
    setStatus(null);
    try {
      const form = new FormData();
      form.set("questionnaireId", selectedId);
      form.set("file", file);
      const res = await fetch("/api/client-cases/documents", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        documents?: StaffDocument[];
        error?: string;
      };
      if (!res.ok) {
        setError(
          data.error === "FILE_TOO_LARGE"
            ? "Файл слишком большой (макс. 10 МБ)."
            : data.error === "UNSUPPORTED_FILE_TYPE"
              ? "Допустимы PDF и изображения (JPG, PNG, WEBP)."
              : "Не удалось загрузить документ.",
        );
        return;
      }
      setDocuments(data.documents ?? []);
      setStatus("Документ загружен");
    } finally {
      setUploadingDoc(false);
    }
  }

  async function removeDocument(documentId: string) {
    if (!selectedId) return;
    setDeletingDocId(documentId);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/client-cases/documents?questionnaireId=${encodeURIComponent(selectedId)}&id=${encodeURIComponent(documentId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as {
        documents?: StaffDocument[];
        error?: string;
      };
      if (!res.ok) {
        setError("Не удалось удалить документ.");
        return;
      }
      setDocuments(data.documents ?? []);
      setStatus("Документ удалён");
    } finally {
      setDeletingDocId(null);
    }
  }

  if (selectedId) {
    return (
      <div className={styles.wrap}>
        <div className={styles.topActions}>
          <button
            type="button"
            className={styles.back}
            onClick={() => {
              setSelectedId(null);
              setReview([]);
              setNotes([]);
              setDocuments([]);
              setNoteDraft("");
              setClientLabel("");
              setStatus(null);
            }}
          >
            ← К списку
          </button>
          <Link href="/dashboard" className={styles.homeLink}>
            Вернуться на главную
          </Link>
        </div>
        <h1 className={styles.title}>{schemaTitle || "Анкета клиента"}</h1>
        {clientLabel ? <p className={styles.lead}>{clientLabel}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {status ? <p className={styles.statusOk}>{status}</p> : null}
        <div className={styles.review}>
          {review.map((row, index) => (
            <div key={`${row.label}-${index}`} className={styles.row}>
              <div className={styles.rowMeta}>
                <span className={styles.section}>{row.section}</span>
                <span className={styles.label}>{row.label}</span>
              </div>
              <div className={styles.value}>
                {row.fileId && selectedId ? (
                  <div className={styles.fileBlock}>
                    <span className={styles.fileName}>
                      {row.value || "Файл"}
                    </span>
                    <div className={styles.fileActions}>
                      <a
                        className={styles.fileBtn}
                        href={caseFileUrl(row.fileId, selectedId, "open")}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Открыть
                      </a>
                      <a
                        className={`${styles.fileBtn} ${styles.fileBtnSecondary}`}
                        href={caseFileUrl(row.fileId, selectedId, "download")}
                      >
                        Скачать
                      </a>
                    </div>
                  </div>
                ) : (
                  row.value || "—"
                )}
              </div>
            </div>
          ))}
        </div>

        <section className={styles.staffBlock}>
          <div className={styles.staffBlockHead}>
            <span className={styles.section}>Документы сотрудника</span>
            <h2 className={styles.staffBlockTitle}>Документы клиента</h2>
            <p className={styles.staffBlockHint}>
              PDF или изображение до 10 МБ. Файлы видны только сотрудникам.
            </p>
          </div>
          {documents.length === 0 ? (
            <p className={styles.muted}>Пока нет загруженных документов.</p>
          ) : (
            <ul className={styles.docList}>
              {documents.map((doc) => (
                <li key={doc.id} className={styles.docItem}>
                  <div className={styles.docMeta}>
                    <span className={styles.fileName}>{doc.fileName}</span>
                    <span className={styles.docSub}>
                      {formatBytes(doc.sizeBytes)} · {doc.uploadedByName} ·{" "}
                      {formatSubmittedAt(doc.createdAt)}
                    </span>
                    <div className={styles.fileActions}>
                      <a
                        className={styles.fileBtn}
                        href={caseFileUrl(doc.id, selectedId, "open")}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Открыть
                      </a>
                      <a
                        className={`${styles.fileBtn} ${styles.fileBtnSecondary}`}
                        href={caseFileUrl(doc.id, selectedId, "download")}
                      >
                        Скачать
                      </a>
                      <button
                        type="button"
                        className={styles.docDelete}
                        disabled={deletingDocId === doc.id}
                        onClick={() => void removeDocument(doc.id)}
                      >
                        {deletingDocId === doc.id ? "…" : "Удалить"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <label className={styles.primaryAction}>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              disabled={uploadingDoc}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void uploadDocument(file);
              }}
            />
            {uploadingDoc ? "Загрузка…" : "Добавить документ"}
          </label>
        </section>

        <section className={styles.staffBlock}>
          <div className={styles.staffBlockHead}>
            <span className={styles.section}>Комментарии</span>
            <h2 className={styles.staffBlockTitle}>Заметки по клиенту</h2>
            <p className={styles.staffBlockHint}>
              Внутренние комментарии сотрудников по этой анкете.
            </p>
          </div>
          {notes.length === 0 ? (
            <p className={styles.muted}>Комментариев пока нет.</p>
          ) : (
            <ul className={styles.noteList}>
              {notes.map((note) => (
                <li key={note.id} className={styles.noteItem}>
                  <div className={styles.noteMeta}>
                    <strong>{note.authorName}</strong>
                    <span>{formatSubmittedAt(note.createdAt)}</span>
                  </div>
                  <p className={styles.noteText}>{note.text}</p>
                </li>
              ))}
            </ul>
          )}
          <textarea
            className={styles.noteInput}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            rows={4}
            placeholder="Напишите комментарий…"
            aria-label="Новый комментарий"
          />
          <button
            type="button"
            className={styles.primaryAction}
            disabled={savingNote || !noteDraft.trim()}
            onClick={() => void submitNote()}
          >
            {savingNote ? "Сохранение…" : "Добавить комментарий"}
          </button>
        </section>
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
        <div className={styles.headerActions}>
          <Link href="/dashboard" className={styles.homeLink}>
            Вернуться на главную
          </Link>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void loadList()}
          >
            Обновить
          </button>
        </div>
      </header>

      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по имени, email, куратору, партнёру и другим колонкам…"
          aria-label="Поиск по таблице заявок"
        />
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {status ? <p className={styles.statusOk}>{status}</p> : null}
      {loading ? <p className={styles.muted}>Загрузка…</p> : null}

      {!loading && items.length === 0 ? (
        <p className={styles.muted}>Пока нет отправленных анкет.</p>
      ) : null}

      {!loading && items.length > 0 && filteredItems.length === 0 ? (
        <p className={styles.muted}>Ничего не найдено по запросу.</p>
      ) : null}

      {!loading && filteredItems.length > 0 ? (
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
              {filteredItems.map((item, index) => {
                const name = clientName(item);
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
