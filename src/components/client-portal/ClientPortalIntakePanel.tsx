"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EmigrantLogo } from "@/components/client-portal/EmigrantLogo";
import { CaseFinancePanel } from "@/components/finance/CaseFinancePanel";
import {
  dateInRange,
  matchesApprovalFilter,
  matchesPresenceFilter,
  type ApprovalFilter,
  type PresenceFilter,
} from "@/lib/clients/list-filter-utils";
import { downloadCsv, uniqueSortedValues } from "@/lib/export/download-csv";
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
  isLegacy?: boolean;
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

type ProcessStatusState = {
  value: string;
  updatedAt: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
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

type Props = {
  initialCaseId?: string | null;
};

type CaseView =
  | "menu"
  | "questionnaire"
  | "status"
  | "finance"
  | "documents"
  | "notes";

export function ClientPortalIntakePanel({ initialCaseId = null }: Props) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, QuestionnaireStaffFields>>(
    {},
  );
  const [query, setQuery] = useState("");
  const [curator, setCurator] = useState("");
  const [partner, setPartner] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [submittedFrom, setSubmittedFrom] = useState("");
  const [submittedTo, setSubmittedTo] = useState("");
  const [hasAmount, setHasAmount] = useState<PresenceFilter>("");
  const [approvalStatus, setApprovalStatus] = useState<ApprovalFilter>("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [caseView, setCaseView] = useState<CaseView>("menu");
  const deepLinkHandled = useRef(false);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [documents, setDocuments] = useState<StaffDocument[]>([]);
  const [processStatus, setProcessStatus] = useState<ProcessStatusState | null>(
    null,
  );
  const [processStatusDraft, setProcessStatusDraft] = useState("");
  const [processStatusOptions, setProcessStatusOptions] = useState<string[]>(
    [],
  );
  const [savingProcessStatus, setSavingProcessStatus] = useState(false);
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

  const filterOptions = useMemo(() => {
    const draftsList = items.map(
      (item) => drafts[item.id] ?? EMPTY_STAFF_FIELDS,
    );
    return {
      curators: uniqueSortedValues(draftsList.map((d) => d.curator)),
      partners: uniqueSortedValues(draftsList.map((d) => d.partner)),
      contracts: uniqueSortedValues(draftsList.map((d) => d.contractNumber)),
    };
  }, [items, drafts]);

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) => {
          const draft = drafts[item.id] ?? EMPTY_STAFF_FIELDS;
          if (!rowMatchesQuery(item, draft, query)) return false;
          if (curator && draft.curator.trim() !== curator) return false;
          if (partner && draft.partner.trim() !== partner) return false;
          if (contractNumber && draft.contractNumber.trim() !== contractNumber) {
            return false;
          }
          if (
            !dateInRange(
              item.submittedAt,
              submittedFrom || undefined,
              submittedTo || undefined,
            )
          ) {
            return false;
          }
          if (!matchesPresenceFilter(draft.contractAmount, hasAmount)) {
            return false;
          }
          if (!matchesApprovalFilter(draft.trpApprovalDate, approvalStatus)) {
            return false;
          }
          return true;
        })
        .sort((a, b) =>
          clientName(a).localeCompare(clientName(b), "ru", {
            sensitivity: "base",
            numeric: true,
          }),
        ),
    [
      items,
      drafts,
      query,
      curator,
      partner,
      contractNumber,
      submittedFrom,
      submittedTo,
      hasAmount,
      approvalStatus,
    ],
  );

  const clearListFilters = () => {
    setQuery("");
    setCurator("");
    setPartner("");
    setContractNumber("");
    setSubmittedFrom("");
    setSubmittedTo("");
    setHasAmount("");
    setApprovalStatus("");
  };

  const exportFilteredCsv = () => {
    const headers = [
      "Клиент",
      "Email",
      "Дата подачи",
      ...STAFF_FIELD_COLUMNS.map((col) => col.label),
    ];
    const rows = filteredItems.map((item) => {
      const draft = drafts[item.id] ?? EMPTY_STAFF_FIELDS;
      return [
        clientName(item),
        item.email,
        formatSubmittedAt(item.submittedAt),
        ...STAFF_FIELD_COLUMNS.map((col) => draft[col.key]),
      ];
    });
    downloadCsv(
      `emigrant-intake-${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows,
    );
  };

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
    setCaseView("menu");
    setClientLabel(clientName(item));
    setError(null);
    setStatus(null);
    setNoteDraft("");
    const res = await fetch(`/api/client-cases?id=${encodeURIComponent(item.id)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      setError("Не удалось открыть карточку клиента.");
      return;
    }
    const data = (await res.json()) as {
      schemaTitle: string;
      review: ReviewRow[];
      notes?: StaffNote[];
      documents?: StaffDocument[];
      processStatus?: ProcessStatusState | null;
      processStatusOptions?: string[];
    };
    setSchemaTitle(data.schemaTitle);
    setReview(data.review ?? []);
    setNotes(data.notes ?? []);
    setDocuments(data.documents ?? []);
    setProcessStatus(data.processStatus ?? null);
    setProcessStatusDraft(data.processStatus?.value ?? "");
    setProcessStatusOptions(data.processStatusOptions ?? []);
    setItems((prev) =>
      prev.map((row) =>
        row.id === item.id ? { ...row, isNew: false } : row,
      ),
    );
  }

  function closeCase() {
    setSelectedId(null);
    setCaseView("menu");
    setReview([]);
    setNotes([]);
    setDocuments([]);
    setProcessStatus(null);
    setProcessStatusDraft("");
    setProcessStatusOptions([]);
    setNoteDraft("");
    setClientLabel("");
    setStatus(null);
  }

  useEffect(() => {
    if (deepLinkHandled.current || loading || !initialCaseId) return;
    const item = items.find((row) => row.id === initialCaseId);
    if (!item) return;
    deepLinkHandled.current = true;
    void openCase(item);
  }, [initialCaseId, items, loading]);

  async function saveProcessStatus() {
    if (!selectedId || !processStatusDraft.trim()) return;
    setSavingProcessStatus(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/client-cases/process-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionnaireId: selectedId,
          status: processStatusDraft,
        }),
      });
      const data = (await res.json()) as {
        processStatus?: ProcessStatusState;
        emailSent?: boolean;
        unchanged?: boolean;
        error?: string;
      };
      if (!res.ok || !data.processStatus) {
        setError("Не удалось обновить статус.");
        return;
      }
      setProcessStatus(data.processStatus);
      setProcessStatusDraft(data.processStatus.value);
      if (data.unchanged) {
        setStatus("Статус без изменений");
      } else if (data.emailSent) {
        setStatus("Статус обновлён, клиенту отправлено письмо");
      } else {
        setStatus("Статус обновлён (письмо не удалось отправить)");
      }
    } finally {
      setSavingProcessStatus(false);
    }
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
    const backToMenu = (
      <button
        type="button"
        className={styles.back}
        onClick={() => {
          setCaseView("menu");
          setStatus(null);
          setError(null);
        }}
      >
        ← К разделам клиента
      </button>
    );

    return (
      <div className={styles.wrap}>
        <div className={styles.topActions}>
          {caseView === "menu" ? (
            <button type="button" className={styles.back} onClick={closeCase}>
              ← К списку
            </button>
          ) : (
            backToMenu
          )}
          <Link href="/dashboard" className={styles.homeLink}>
            Вернуться на главную
          </Link>
        </div>
        <h1 className={styles.title}>
          {caseView === "menu"
            ? clientLabel || "Клиент"
            : caseView === "questionnaire"
              ? schemaTitle || "Анкета клиента"
              : caseView === "status"
                ? "Статус процесса клиента"
                : caseView === "finance"
                  ? "Финансы"
                  : caseView === "documents"
                    ? "Документы по клиенту"
                    : "Комментарии"}
        </h1>
        {clientLabel && caseView !== "menu" ? (
          <p className={styles.lead}>{clientLabel}</p>
        ) : null}
        {caseView === "menu" && schemaTitle ? (
          <p className={styles.lead}>{schemaTitle}</p>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {status ? <p className={styles.statusOk}>{status}</p> : null}

        {caseView === "menu" ? (
          <div className={styles.caseMenu} role="navigation" aria-label="Разделы клиента">
            <button
              type="button"
              className={styles.caseMenuCard}
              onClick={() => setCaseView("questionnaire")}
            >
              <span className={styles.caseMenuEyebrow}>Анкета</span>
              <span className={styles.caseMenuTitle}>Анкета</span>
              <span className={styles.caseMenuHint}>
                Ответы клиента из заполненной анкеты
              </span>
            </button>
            <button
              type="button"
              className={styles.caseMenuCard}
              onClick={() => setCaseView("status")}
            >
              <span className={styles.caseMenuEyebrow}>Процесс</span>
              <span className={styles.caseMenuTitle}>
                Статус процесса клиента
              </span>
              <span className={styles.caseMenuHint}>
                Текущий этап дела и уведомление клиента по email
              </span>
            </button>
            <button
              type="button"
              className={styles.caseMenuCard}
              onClick={() => setCaseView("finance")}
            >
              <span className={styles.caseMenuEyebrow}>Оплата</span>
              <span className={styles.caseMenuTitle}>Финансы</span>
              <span className={styles.caseMenuHint}>
                Договор, платежи и задолженность по клиенту
              </span>
            </button>
            <button
              type="button"
              className={styles.caseMenuCard}
              onClick={() => setCaseView("documents")}
            >
              <span className={styles.caseMenuEyebrow}>Файлы</span>
              <span className={styles.caseMenuTitle}>Документы по клиенту</span>
              <span className={styles.caseMenuHint}>
                Внутренние файлы сотрудников по этому клиенту
              </span>
            </button>
            <button
              type="button"
              className={styles.caseMenuCard}
              onClick={() => setCaseView("notes")}
            >
              <span className={styles.caseMenuEyebrow}>Заметки</span>
              <span className={styles.caseMenuTitle}>Комментарии</span>
              <span className={styles.caseMenuHint}>
                Внутренние комментарии сотрудников по клиенту
              </span>
            </button>
          </div>
        ) : null}

        {caseView === "status" ? (
          <section className={styles.staffBlock}>
            <div className={styles.staffBlockHead}>
              <span className={styles.section}>Статус процесса</span>
              <h2 className={styles.staffBlockTitle}>Статус клиента</h2>
              <p className={styles.staffBlockHint}>
                Изменение статуса сразу отобразится на портале клиента и
                отправит ему письмо.
              </p>
            </div>
            {processStatus ? (
              <p className={styles.currentStatus}>
                Сейчас: <strong>{processStatus.value}</strong>
                {processStatus.updatedAt
                  ? ` · ${formatSubmittedAt(processStatus.updatedAt)}`
                  : null}
                {processStatus.updatedByName
                  ? ` · ${processStatus.updatedByName}`
                  : null}
              </p>
            ) : null}
            <div className={styles.statusControls}>
              <select
                className={styles.statusSelect}
                value={processStatusDraft}
                onChange={(event) => setProcessStatusDraft(event.target.value)}
                aria-label="Статус процесса клиента"
              >
                {processStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.primaryAction}
                disabled={
                  savingProcessStatus ||
                  !processStatusDraft ||
                  processStatusDraft === processStatus?.value
                }
                onClick={() => void saveProcessStatus()}
              >
                {savingProcessStatus ? "Сохранение…" : "Обновить статус"}
              </button>
            </div>
          </section>
        ) : null}

        {caseView === "finance" ? (
          <section className={styles.staffBlock}>
            <CaseFinancePanel caseId={selectedId} />
          </section>
        ) : null}

        {caseView === "questionnaire" ? (
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
                          href={caseFileUrl(
                            row.fileId,
                            selectedId,
                            "download",
                          )}
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
        ) : null}

        {caseView === "documents" ? (
          <section className={styles.staffBlock}>
            <div className={styles.staffBlockHead}>
              <span className={styles.section}>Документы сотрудника</span>
              <h2 className={styles.staffBlockTitle}>Документы по клиенту</h2>
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
        ) : null}

        {caseView === "notes" ? (
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
        ) : null}
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
            «Сохранить». Имя открывает разделы карточки клиента.
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
            value={curator}
            onChange={(e) => setCurator(e.target.value)}
            aria-label="Куратор / референт"
          >
            <option value="">Все кураторы</option>
            {filterOptions.curators.map((value) => (
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
            value={contractNumber}
            onChange={(e) => setContractNumber(e.target.value)}
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
            value={hasAmount}
            onChange={(e) => setHasAmount(e.target.value as PresenceFilter)}
            aria-label="Стоимость / оплата"
          >
            <option value="">Стоимость: все</option>
            <option value="yes">Есть сумма договора</option>
            <option value="no">Без суммы</option>
          </select>
          <select
            className={styles.select}
            value={approvalStatus}
            onChange={(e) =>
              setApprovalStatus(e.target.value as ApprovalFilter)
            }
            aria-label="Одобрение ВНЖ"
          >
            <option value="">Одобрение: все</option>
            <option value="approved">Одобрены</option>
            <option value="not_approved">Не одобрены</option>
          </select>
          <button
            type="button"
            className={styles.filterBtn}
            onClick={clearListFilters}
          >
            Сбросить
          </button>
          <button
            type="button"
            className={styles.exportBtn}
            disabled={filteredItems.length === 0}
            onClick={exportFilteredCsv}
          >
            Выгрузить CSV
          </button>
        </div>
        {!loading ? (
          <p className={styles.filterMeta}>
            Показано: {filteredItems.length} из {items.length}
          </p>
        ) : null}
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
                        {item.isLegacy ? (
                          <span className={styles.legacyBadge}>
                            Из старой базы
                          </span>
                        ) : null}
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
