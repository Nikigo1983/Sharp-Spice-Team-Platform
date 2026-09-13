"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import styles from "./KnowledgeBaseView.module.css";

type ListingItem =
  | { kind: "folder"; id: string; name: string; updatedAt: string }
  | {
      kind: "article";
      id: string;
      name: string;
      updatedAt: string;
      preview: string;
    };

type Listing = {
  libraryTitle: string;
  folderId: string | null;
  folderName: string;
  parentId: string | null;
  items: ListingItem[];
};

type Article = {
  id: string;
  title: string;
  body: string;
  folderId: string | null;
  updatedAt: string;
  updatedByName: string | null;
};

export function PlatformKnowledgeBaseView() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{ id: string | null; name: string }>
  >([{ id: null, name: "База знаний для клиентов" }]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState<Article | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingArticle, setCreatingArticle] = useState(false);
  const [newArticleTitle, setNewArticleTitle] = useState("");
  const [importing, setImporting] = useState(false);

  const load = useCallback(async (nextFolderId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = nextFolderId
        ? `?folderId=${encodeURIComponent(nextFolderId)}`
        : "";
      const res = await fetch(`/api/knowledge-base/platform${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as Listing;
      setListing(data);
    } catch {
      setListing(null);
      setError("Не удалось загрузить базу знаний.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(folderId);
  }, [folderId, load]);

  function openFolder(item: ListingItem) {
    if (item.kind !== "folder") return;
    setHistory((prev) => [...prev, { id: item.id, name: item.name }]);
    setFolderId(item.id);
    setEditing(null);
  }

  function goToCrumb(index: number) {
    const crumb = history[index];
    if (!crumb) return;
    setHistory((prev) => prev.slice(0, index + 1));
    setFolderId(crumb.id);
    setEditing(null);
  }

  async function openArticle(id: string) {
    setError(null);
    setStatus(null);
    const res = await fetch(
      `/api/knowledge-base/platform?articleId=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      setError("Не удалось открыть текст.");
      return;
    }
    const data = (await res.json()) as { article: Article };
    setEditing(data.article);
    setDraftTitle(data.article.title);
    setDraftBody(data.article.body);
  }

  async function saveArticle() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/knowledge-base/platform", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          title: draftTitle,
          body: draftBody,
        }),
      });
      if (!res.ok) {
        setError("Не удалось сохранить.");
        return;
      }
      const data = (await res.json()) as { article: Article };
      setEditing(data.article);
      setStatus("Сохранено.");
      await load(folderId);
    } finally {
      setSaving(false);
    }
  }

  async function removeArticle() {
    if (!editing) return;
    if (!window.confirm(`Удалить «${editing.title}»?`)) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/knowledge-base/platform?id=${encodeURIComponent(editing.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setError("Не удалось удалить.");
        return;
      }
      setEditing(null);
      setStatus("Удалено.");
      await load(folderId);
    } finally {
      setSaving(false);
    }
  }

  async function createFolder(event: React.FormEvent) {
    event.preventDefault();
    setCreatingFolder(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-base/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "folder",
          name: newFolderName,
          parentId: folderId,
        }),
      });
      if (!res.ok) {
        setError("Не удалось создать папку.");
        return;
      }
      setNewFolderName("");
      await load(folderId);
    } finally {
      setCreatingFolder(false);
    }
  }

  async function createArticle(event: React.FormEvent) {
    event.preventDefault();
    setCreatingArticle(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-base/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "article",
          title: newArticleTitle,
          body: "",
          folderId,
        }),
      });
      if (!res.ok) {
        setError("Не удалось создать текст.");
        return;
      }
      const data = (await res.json()) as { article: Article };
      setNewArticleTitle("");
      setEditing(data.article);
      setDraftTitle(data.article.title);
      setDraftBody(data.article.body);
      await load(folderId);
    } finally {
      setCreatingArticle(false);
    }
  }

  async function importFromDrive() {
    if (
      !window.confirm(
        "Импортировать папку Immigration_Knowledge_Base из Google Drive в «База знаний для клиентов»?",
      )
    ) {
      return;
    }
    setImporting(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/knowledge-base/platform/import", {
        method: "POST",
      });
      const data = (await res.json()) as {
        folders?: number;
        articles?: number;
        updated?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(
          data.error === "TARGET_FOLDER_NOT_FOUND"
            ? "Папка Immigration_Knowledge_Base не найдена в Google Drive."
            : "Не удалось импортировать из Google Drive.",
        );
        return;
      }
      setStatus(
        `Импорт готов: папок ${data.folders ?? 0}, текстов ${data.articles ?? 0}, обновлено ${data.updated ?? 0}.`,
      );
      await load(folderId);
    } finally {
      setImporting(false);
    }
  }

  if (editing) {
    return (
      <div className={styles.wrap}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => setEditing(null)}
          >
            ← К списку
          </button>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.linkBtn}
              disabled={saving}
              onClick={() => void saveArticle()}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
            <button
              type="button"
              className={styles.dangerBtn}
              disabled={saving}
              onClick={() => void removeArticle()}
            >
              Удалить
            </button>
          </div>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        {status ? <p className={styles.statusOk}>{status}</p> : null}
        <Card className={styles.editorCard}>
          <label className={styles.editorLabel}>
            Заголовок
            <input
              className={styles.editorInput}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
            />
          </label>
          <label className={styles.editorLabel}>
            Текст
            <textarea
              className={styles.editorTextarea}
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
              rows={18}
            />
          </label>
          <p className={styles.meta}>
            Обновлено:{" "}
            {new Date(editing.updatedAt).toLocaleString("ru-RU")}
            {editing.updatedByName ? ` · ${editing.updatedByName}` : ""}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <nav className={styles.breadcrumb} aria-label="Путь">
          {history.map((crumb, index) => (
            <span key={`${crumb.id ?? "root"}-${index}`}>
              {index > 0 ? <span className={styles.crumbSep}> / </span> : null}
              <button
                type="button"
                className={styles.crumbBtn}
                onClick={() => goToCrumb(index)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.linkBtn}
            disabled={importing}
            onClick={() => void importFromDrive()}
          >
            {importing ? "Импорт…" : "Импорт из Drive"}
          </button>
        </div>
      </div>

      <p className={styles.hint}>
        Тексты хранятся на платформе (Supabase). Менеджеры могут добавлять и
        редактировать материалы.
      </p>

      <div className={styles.createRow}>
        <form className={styles.createForm} onSubmit={createFolder}>
          <input
            className={styles.editorInput}
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="Новая папка"
            required
            disabled={creatingFolder}
          />
          <button
            type="submit"
            className={styles.linkBtn}
            disabled={creatingFolder}
          >
            Папка
          </button>
        </form>
        <form className={styles.createForm} onSubmit={createArticle}>
          <input
            className={styles.editorInput}
            value={newArticleTitle}
            onChange={(event) => setNewArticleTitle(event.target.value)}
            placeholder="Новый текст"
            required
            disabled={creatingArticle}
          />
          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={creatingArticle}
          >
            Добавить текст
          </button>
        </form>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {status ? <p className={styles.statusOk}>{status}</p> : null}

      <p className={styles.meta}>
        {loading ? "Загрузка…" : `${listing?.items.length ?? 0} элементов`}
        <span className={styles.source}>Supabase</span>
      </p>

      <Card className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Название</th>
                <th>Тип</th>
                <th>Изменён</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : !listing || listing.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    Пока пусто. Добавьте текст или запустите импорт из Google
                    Drive.
                  </td>
                </tr>
              ) : (
                listing.items.map((item) => (
                  <tr key={`${item.kind}-${item.id}`}>
                    <td>
                      <div className={styles.nameCell}>
                        <i
                          className={
                            item.kind === "folder"
                              ? `fa-solid fa-folder ${styles.nameIcon}`
                              : `fa-solid fa-file-lines ${styles.nameIcon}`
                          }
                          aria-hidden
                        />
                        {item.kind === "folder" ? (
                          <button
                            type="button"
                            className={styles.nameBtn}
                            onClick={() => openFolder(item)}
                          >
                            {item.name}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.nameBtn}
                            onClick={() => void openArticle(item.id)}
                          >
                            {item.name}
                          </button>
                        )}
                      </div>
                      {item.kind === "article" && item.preview ? (
                        <p className={styles.preview}>{item.preview}</p>
                      ) : null}
                    </td>
                    <td>{item.kind === "folder" ? "Папка" : "Текст"}</td>
                    <td>
                      {new Date(item.updatedAt).toLocaleString("ru-RU")}
                    </td>
                    <td>
                      {item.kind === "article" ? (
                        <button
                          type="button"
                          className={styles.openLink}
                          onClick={() => void openArticle(item.id)}
                        >
                          Открыть
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.openLink}
                          onClick={() => openFolder(item)}
                        >
                          Открыть
                        </button>
                      )}
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
