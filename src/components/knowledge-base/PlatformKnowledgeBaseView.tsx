"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { KbLibrarySlug } from "@/lib/knowledge-base/types";
import styles from "./KnowledgeBaseView.module.css";

type ListingItem =
  | { kind: "folder"; id: string; name: string; updatedAt: string }
  | {
      kind: "article";
      id: string;
      name: string;
      updatedAt: string;
      preview: string;
      articleKind?: "text" | "file";
      mimeType?: string | null;
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
  kind?: "text" | "file";
  storagePath?: string | null;
  fileName?: string | null;
  sourceMimeType?: string | null;
  sizeBytes?: number | null;
  updatedAt: string;
  updatedByName: string | null;
};

function libraryLabel(slug: KbLibrarySlug): string {
  return slug === "company_knowledge"
    ? "База знаний для компании"
    : "База знаний для клиентов";
}

export function PlatformKnowledgeBaseView({
  library = "client_knowledge",
}: {
  library?: KbLibrarySlug;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{ id: string | null; name: string }>
  >([{ id: null, name: libraryLabel(library) }]);
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
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFolderId(null);
    setEditing(null);
    setHistory([{ id: null, name: libraryLabel(library) }]);
    setStatus(null);
    setError(null);
  }, [library]);

  const load = useCallback(
    async (nextFolderId: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ library });
        if (nextFolderId) params.set("folderId", nextFolderId);
        const res = await fetch(
          `/api/knowledge-base/platform?${params.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json()) as Listing;
        setListing(data);
      } catch {
        setListing(null);
        setError("Не удалось загрузить базу знаний.");
      } finally {
        setLoading(false);
      }
    },
    [library],
  );

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
    const params = new URLSearchParams({ library, articleId: id });
    const res = await fetch(
      `/api/knowledge-base/platform?${params.toString()}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      setError("Не удалось открыть материал.");
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
          library,
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
      const params = new URLSearchParams({ library, id: editing.id });
      const res = await fetch(
        `/api/knowledge-base/platform?${params.toString()}`,
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

  async function removeListItem(item: ListingItem) {
    const label =
      item.kind === "folder"
        ? `папку «${item.name}» вместе со всем содержимым`
        : `«${item.name}»`;
    if (!window.confirm(`Удалить ${label}?`)) return;
    setError(null);
    setStatus(null);
    try {
      const params = new URLSearchParams({
        library,
        id: item.id,
        kind: item.kind === "folder" ? "folder" : "article",
      });
      const res = await fetch(
        `/api/knowledge-base/platform?${params.toString()}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setError("Не удалось удалить.");
        return;
      }
      if (editing?.id === item.id) setEditing(null);
      setStatus("Удалено.");
      await load(folderId);
    } catch {
      setError("Не удалось удалить.");
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
          library,
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
          library,
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

  async function uploadDocuments(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploadingFiles(true);
    setError(null);
    setStatus(null);
    try {
      const form = new FormData();
      form.set("library", library);
      if (folderId) form.set("folderId", folderId);
      Array.from(fileList).forEach((file) => form.append("file", file));

      const res = await fetch("/api/knowledge-base/platform/file", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        uploaded?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(
          data.error === "FILE_TOO_LARGE"
            ? "Файл слишком большой (лимит 40 МБ)."
            : data.error === "FOLDER_NOT_FOUND"
              ? "Папка не найдена. Обновите страницу и попробуйте снова."
              : data.error === "KB_STATE_SAVE_FAILED"
                ? "Не удалось сохранить в базу. Проверьте подключение Supabase."
                : "Не удалось загрузить документ.",
        );
        return;
      }
      const failed = data.failed ?? 0;
      setStatus(
        failed > 0
          ? `Загружено: ${data.uploaded ?? 0}, с ошибкой: ${failed}.`
          : `Документы добавлены: ${data.uploaded ?? 0}.`,
      );
      await load(folderId);
    } catch {
      setError("Не удалось загрузить документ.");
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const fileUrl = editing?.storagePath
    ? `/api/knowledge-base/platform/file?library=${encodeURIComponent(library)}&id=${encodeURIComponent(editing.id)}`
    : null;
  const isImage =
    Boolean(editing?.sourceMimeType?.startsWith("image/")) ||
    /\.(png|jpe?g|gif|webp|bmp)$/i.test(editing?.fileName || editing?.title || "");

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
            {fileUrl ? (
              <>
                <a
                  className={styles.linkBtn}
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть файл
                </a>
                <a
                  className={styles.linkBtn}
                  href={`${fileUrl}&download=1`}
                >
                  Скачать
                </a>
              </>
            ) : null}
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
          {fileUrl && isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fileUrl}
              alt={editing.title}
              className={styles.filePreview}
            />
          ) : null}
          {fileUrl && editing.sourceMimeType?.includes("pdf") ? (
            <iframe
              title={editing.title}
              src={fileUrl}
              className={styles.pdfPreview}
            />
          ) : null}
          <label className={styles.editorLabel}>
            {editing.kind === "file" ? "Текст / описание" : "Текст"}
            <textarea
              className={styles.editorTextarea}
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
              rows={18}
            />
          </label>
          <p className={styles.meta}>
            Обновлено: {new Date(editing.updatedAt).toLocaleString("ru-RU")}
            {editing.updatedByName ? ` · ${editing.updatedByName}` : ""}
            {editing.fileName ? ` · ${editing.fileName}` : ""}
            {typeof editing.sizeBytes === "number"
              ? ` · ${Math.max(1, Math.round(editing.sizeBytes / 1024))} КБ`
              : ""}
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
      </div>

      <p className={styles.hint}>
        {library === "company_knowledge"
          ? folderId
            ? `Корпоративная база на платформе (Supabase Storage). Сейчас открыта папка «${listing?.folderName || "…"}» — сюда можно добавить текст или документ. Удалить можно любой файл или папку.`
            : "Корпоративная база на платформе (Supabase Storage). На главной странице можно создавать папки; текст и файлы добавляйте уже внутри папок."
          : "Тексты хранятся на платформе (Supabase). Менеджеры могут добавлять и редактировать материалы."}
        {library !== "company_knowledge"
          ? folderId
            ? ` Сейчас открыта папка «${listing?.folderName || "…"}» — новые папки и документы попадут сюда.`
            : " Новые папки и документы можно создавать на любом уровне."
          : ""}
      </p>

      <div className={styles.createPanel}>
        <form className={styles.createAction} onSubmit={createFolder}>
          <span className={styles.createActionLabel}>Папка</span>
          <div className={styles.createActionBody}>
            <input
              className={styles.editorInput}
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="Название новой папки"
              required
              disabled={creatingFolder}
              aria-label="Название новой папки"
            />
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={creatingFolder}
            >
              {creatingFolder ? "Создание…" : "Создать папку"}
            </button>
          </div>
        </form>
        {library !== "company_knowledge" || folderId ? (
          <>
            <form className={styles.createAction} onSubmit={createArticle}>
              <span className={styles.createActionLabel}>Текст</span>
              <div className={styles.createActionBody}>
                <input
                  className={styles.editorInput}
                  value={newArticleTitle}
                  onChange={(event) => setNewArticleTitle(event.target.value)}
                  placeholder="Заголовок нового текста"
                  required
                  disabled={creatingArticle}
                  aria-label="Заголовок нового текста"
                />
                <button
                  type="submit"
                  className={styles.linkBtn}
                  disabled={creatingArticle}
                >
                  Добавить текст
                </button>
              </div>
            </form>
            <div className={styles.createAction}>
              <span className={styles.createActionLabel}>Документ</span>
              <div className={styles.createActionBody}>
                <input
                  ref={fileInputRef}
                  className={styles.fileInput}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={uploadingFiles}
                  onChange={(event) => void uploadDocuments(event.target.files)}
                  aria-label="Добавить документ"
                />
                <p className={styles.uploadHint}>
                  PDF, Word, Excel, PowerPoint, фото, текст — до 40 МБ
                </p>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={uploadingFiles}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingFiles ? "Загрузка…" : "Добавить документ"}
                </button>
              </div>
            </div>
          </>
        ) : null}
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
                    {library === "company_knowledge"
                      ? folderId
                        ? "Пока пусто. Создайте папку, добавьте текст или документ."
                        : "Пока пусто. Создайте папку."
                      : "Пока пусто. Создайте папку, добавьте текст или документ."}
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
                              : item.kind === "article" &&
                                  item.articleKind === "file"
                                ? `fa-solid fa-file ${styles.nameIcon}`
                                : `fa-solid fa-file-lines ${styles.nameIcon}`
                          }
                          aria-hidden
                        />
                        <button
                          type="button"
                          className={styles.nameBtn}
                          onClick={() =>
                            item.kind === "folder"
                              ? openFolder(item)
                              : void openArticle(item.id)
                          }
                        >
                          {item.name}
                        </button>
                      </div>
                      {item.kind === "article" && item.preview ? (
                        <p className={styles.preview}>{item.preview}</p>
                      ) : null}
                    </td>
                    <td>
                      {item.kind === "folder"
                        ? "Папка"
                        : item.articleKind === "file"
                          ? "Файл"
                          : "Текст"}
                    </td>
                    <td>
                      {new Date(item.updatedAt).toLocaleString("ru-RU")}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={() => void removeListItem(item)}
                      >
                        Удалить
                      </button>
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
