"use client";

import { useCallback, useEffect, useState } from "react";
import type { DriveKbListing } from "@/lib/google-drive/kb-drive";
import { Card } from "@/components/ui/Card";

import styles from "./KnowledgeBaseView.module.css";

export function KnowledgeBaseView() {
  const [listing, setListing] = useState<DriveKbListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(
    undefined,
  );
  const [history, setHistory] = useState<string[]>([]);

  const fetchFolder = useCallback(async (folderId?: string) => {
    setLoading(true);
    try {
      const params = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
      const res = await fetch(`/api/knowledge-base${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as DriveKbListing;
      setListing(data);
    } catch {
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFolder(currentFolderId);
    const interval = setInterval(() => {
      void fetchFolder(currentFolderId);
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchFolder, currentFolderId]);

  const openFolder = (folderId: string) => {
    if (!listing) return;
    setHistory((prev) => [...prev, listing.folderId]);
    setCurrentFolderId(folderId);
  };

  const goToFolder = (folderId: string | null, index: number) => {
    if (folderId === null) {
      setHistory([]);
      setCurrentFolderId(undefined);
      return;
    }
    setHistory((prev) => prev.slice(0, index));
    setCurrentFolderId(folderId);
  };

  const goUp = () => {
    if (!listing?.parentId) {
      setHistory([]);
      setCurrentFolderId(undefined);
      return;
    }
    setHistory((prev) => prev.slice(0, -1));
    setCurrentFolderId(listing.parentId);
  };

  const rootUrl = listing
    ? `https://drive.google.com/drive/folders/${listing.rootFolderId}`
    : "https://drive.google.com";

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <nav className={styles.breadcrumb} aria-label="Путь по папкам">
          <button
            type="button"
            className={styles.crumbBtn}
            onClick={() => goToFolder(null, -1)}
          >
            Knowledge Base
          </button>
          {history.map((folderId, index) => (
            <span key={folderId} className={styles.crumbSep}>
              /
              <button
                type="button"
                className={styles.crumbBtn}
                onClick={() => goToFolder(folderId, index)}
              >
                …
              </button>
            </span>
          ))}
          {listing ? (
            <>
              <span className={styles.crumbSep}>/</span>
              <span>{listing.folderName}</span>
            </>
          ) : null}
        </nav>

        <div className={styles.actions}>
          {listing?.parentId !== null ? (
            <button type="button" className={styles.linkBtn} onClick={goUp}>
              <i className="fa-solid fa-arrow-left" aria-hidden /> Назад
            </button>
          ) : null}
          <a
            href={rootUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.linkBtn}
          >
            <i className="fa-solid fa-folder-open" aria-hidden />
            Открыть в Google Drive
          </a>
        </div>
      </div>

      <p className={styles.meta}>
        {loading
          ? "Загрузка…"
          : `${listing?.items.length ?? 0} элементов`}
        <span className={styles.source}>
          {listing?.source === "google_drive"
            ? "Google Drive"
            : listing?.source === "error"
              ? "Ошибка подключения"
              : "Не настроено"}
        </span>
      </p>

      <p className={styles.hint}>
        Файлы остаются в Google Drive — платформа показывает актуальную структуру
        папок и ссылки. Обновление каждые 60 секунд.
      </p>

      <Card className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Название</th>
                <th>Тип</th>
                <th>Изменён</th>
                <th>Открыть</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    Загрузка базы знаний…
                  </td>
                </tr>
              ) : !listing || listing.source === "error" ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    {listing?.errorMessage ??
                      "Не удалось загрузить данные из Google Drive."}
                  </td>
                </tr>
              ) : listing.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    Папка пуста. Если файлы есть в Drive — расшарьте папку на{" "}
                    <code>sharp-spice-platform@project-3bfd25e8-8781-480b-8f9.iam.gserviceaccount.com</code>
                  </td>
                </tr>
              ) : (
                listing.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className={styles.nameCell}>
                        <i
                          className={
                            item.isFolder
                              ? `fa-solid fa-folder ${styles.nameIcon}`
                              : `fa-solid fa-file ${styles.nameIcon}`
                          }
                          aria-hidden
                        />
                        {item.isFolder ? (
                          <button
                            type="button"
                            className={styles.nameBtn}
                            onClick={() => openFolder(item.id)}
                          >
                            {item.name}
                          </button>
                        ) : (
                          <a
                            href={item.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.fileLink}
                          >
                            {item.name}
                          </a>
                        )}
                      </div>
                    </td>
                    <td>{item.sizeLabel}</td>
                    <td>{item.modifiedTime}</td>
                    <td>
                      <a
                        href={item.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.openLink}
                      >
                        Google Drive
                        <i
                          className="fa-solid fa-arrow-up-right-from-square"
                          aria-hidden
                        />
                      </a>
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
