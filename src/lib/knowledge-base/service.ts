import "server-only";

import { randomUUID } from "node:crypto";
import { loadKbSnapshot, saveKbSnapshot } from "./store";
import {
  CLIENT_KB_LIBRARY_ID,
  CLIENT_KB_LIBRARY_SLUG,
  CLIENT_KB_LIBRARY_TITLE,
  type KbArticle,
  type KbFolder,
  type KbLibrarySnapshot,
  type KbListingItem,
} from "./types";

function previewText(body: string, max = 120): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

export async function getClientKnowledgeLibrary(): Promise<KbLibrarySnapshot> {
  const snapshot = await loadKbSnapshot();
  if (snapshot.library.id === CLIENT_KB_LIBRARY_ID) return snapshot;
  return {
    ...snapshot,
    library: {
      id: CLIENT_KB_LIBRARY_ID,
      slug: CLIENT_KB_LIBRARY_SLUG,
      title: CLIENT_KB_LIBRARY_TITLE,
      updatedAt: snapshot.library.updatedAt,
    },
  };
}

export async function listClientKnowledgeFolder(
  folderId: string | null,
): Promise<{
  libraryTitle: string;
  folderId: string | null;
  folderName: string;
  parentId: string | null;
  items: KbListingItem[];
}> {
  const snapshot = await getClientKnowledgeLibrary();
  const folders = snapshot.folders.filter((f) => f.parentId === folderId);
  const articles = snapshot.articles.filter((a) => a.folderId === folderId);

  const current = folderId
    ? snapshot.folders.find((f) => f.id === folderId) ?? null
    : null;

  const items: KbListingItem[] = [
    ...folders
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"))
      .map((folder) => ({
        kind: "folder" as const,
        id: folder.id,
        name: folder.name,
        updatedAt: folder.updatedAt,
      })),
    ...articles
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, "ru"))
      .map((article) => ({
        kind: "article" as const,
        id: article.id,
        name: article.title,
        updatedAt: article.updatedAt,
        preview: previewText(article.body),
      })),
  ];

  return {
    libraryTitle: snapshot.library.title,
    folderId,
    folderName: current?.name ?? snapshot.library.title,
    parentId: current?.parentId ?? null,
    items,
  };
}

export async function getClientKnowledgeArticle(
  id: string,
): Promise<KbArticle | null> {
  const snapshot = await getClientKnowledgeLibrary();
  return snapshot.articles.find((article) => article.id === id) ?? null;
}

export async function createClientKnowledgeFolder(input: {
  name: string;
  parentId?: string | null;
}): Promise<KbFolder> {
  const name = input.name.trim();
  if (!name) throw new Error("INVALID_NAME");

  const snapshot = await getClientKnowledgeLibrary();
  const parentId = input.parentId ?? null;
  if (parentId && !snapshot.folders.some((f) => f.id === parentId)) {
    throw new Error("FOLDER_NOT_FOUND");
  }

  const now = new Date().toISOString();
  const folder: KbFolder = {
    id: randomUUID(),
    libraryId: CLIENT_KB_LIBRARY_ID,
    parentId,
    name,
    sortOrder: snapshot.folders.filter((f) => f.parentId === parentId).length,
    sourceDriveId: null,
    createdAt: now,
    updatedAt: now,
  };

  await saveKbSnapshot({
    ...snapshot,
    folders: [...snapshot.folders, folder],
  });
  return folder;
}

export async function createClientKnowledgeArticle(input: {
  title: string;
  body?: string;
  folderId?: string | null;
  updatedByUserId: string;
  updatedByName: string;
}): Promise<KbArticle> {
  const title = input.title.trim();
  if (!title) throw new Error("INVALID_TITLE");

  const snapshot = await getClientKnowledgeLibrary();
  const folderId = input.folderId ?? null;
  if (folderId && !snapshot.folders.some((f) => f.id === folderId)) {
    throw new Error("FOLDER_NOT_FOUND");
  }

  const now = new Date().toISOString();
  const article: KbArticle = {
    id: randomUUID(),
    libraryId: CLIENT_KB_LIBRARY_ID,
    folderId,
    title,
    body: input.body ?? "",
    status: "published",
    sourceDriveId: null,
    sourceMimeType: null,
    updatedByUserId: input.updatedByUserId,
    updatedByName: input.updatedByName,
    createdAt: now,
    updatedAt: now,
  };

  await saveKbSnapshot({
    ...snapshot,
    articles: [article, ...snapshot.articles],
  });
  return article;
}

export async function updateClientKnowledgeArticle(input: {
  id: string;
  title?: string;
  body?: string;
  folderId?: string | null;
  updatedByUserId: string;
  updatedByName: string;
}): Promise<KbArticle> {
  const snapshot = await getClientKnowledgeLibrary();
  const index = snapshot.articles.findIndex((a) => a.id === input.id);
  if (index < 0) throw new Error("NOT_FOUND");

  if (
    input.folderId &&
    !snapshot.folders.some((f) => f.id === input.folderId)
  ) {
    throw new Error("FOLDER_NOT_FOUND");
  }

  const current = snapshot.articles[index]!;
  const now = new Date().toISOString();
  const next: KbArticle = {
    ...current,
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : current.title,
    body: typeof input.body === "string" ? input.body : current.body,
    folderId:
      input.folderId === undefined ? current.folderId : input.folderId,
    updatedByUserId: input.updatedByUserId,
    updatedByName: input.updatedByName,
    updatedAt: now,
  };

  const articles = snapshot.articles.slice();
  articles[index] = next;
  await saveKbSnapshot({ ...snapshot, articles });
  return next;
}

export async function deleteClientKnowledgeArticle(id: string): Promise<void> {
  const snapshot = await getClientKnowledgeLibrary();
  if (!snapshot.articles.some((a) => a.id === id)) {
    throw new Error("NOT_FOUND");
  }
  await saveKbSnapshot({
    ...snapshot,
    articles: snapshot.articles.filter((a) => a.id !== id),
  });
}

/** Merge imported folders/articles (idempotent by sourceDriveId). */
export async function upsertImportedKnowledge(input: {
  folders: Array<{
    sourceDriveId: string;
    parentSourceDriveId: string | null;
    name: string;
  }>;
  articles: Array<{
    sourceDriveId: string;
    parentSourceDriveId: string | null;
    title: string;
    body: string;
    sourceMimeType: string | null;
  }>;
  updatedByName?: string;
}): Promise<{ folders: number; articles: number; updated: number }> {
  const snapshot = await getClientKnowledgeLibrary();
  const now = new Date().toISOString();
  const folderIdByDrive = new Map<string, string>();

  for (const folder of snapshot.folders) {
    if (folder.sourceDriveId) {
      folderIdByDrive.set(folder.sourceDriveId, folder.id);
    }
  }

  let foldersTouched = 0;
  let articlesTouched = 0;
  let updated = 0;

  // Multiple passes so parents can be created before children regardless of order.
  const pendingFolders = input.folders.slice();
  let safety = pendingFolders.length + 5;
  while (pendingFolders.length > 0 && safety > 0) {
    safety -= 1;
    const nextRound: typeof pendingFolders = [];
    for (const item of pendingFolders) {
      const parentOk =
        item.parentSourceDriveId === null ||
        folderIdByDrive.has(item.parentSourceDriveId);
      if (!parentOk) {
        nextRound.push(item);
        continue;
      }

      const existingId = folderIdByDrive.get(item.sourceDriveId);
      const parentId = item.parentSourceDriveId
        ? folderIdByDrive.get(item.parentSourceDriveId) ?? null
        : null;

      if (existingId) {
        const idx = snapshot.folders.findIndex((f) => f.id === existingId);
        if (idx >= 0) {
          const current = snapshot.folders[idx]!;
          if (current.name !== item.name || current.parentId !== parentId) {
            snapshot.folders[idx] = {
              ...current,
              name: item.name,
              parentId,
              updatedAt: now,
            };
            updated += 1;
          }
        }
      } else {
        const id = randomUUID();
        folderIdByDrive.set(item.sourceDriveId, id);
        snapshot.folders.push({
          id,
          libraryId: CLIENT_KB_LIBRARY_ID,
          parentId,
          name: item.name,
          sortOrder: snapshot.folders.filter((f) => f.parentId === parentId)
            .length,
          sourceDriveId: item.sourceDriveId,
          createdAt: now,
          updatedAt: now,
        });
        foldersTouched += 1;
      }
    }
    if (nextRound.length === pendingFolders.length) break;
    pendingFolders.splice(0, pendingFolders.length, ...nextRound);
  }

  const articleByDrive = new Map<string, number>();
  snapshot.articles.forEach((article, index) => {
    if (article.sourceDriveId) {
      articleByDrive.set(article.sourceDriveId, index);
    }
  });

  for (const item of input.articles) {
    const folderId = item.parentSourceDriveId
      ? folderIdByDrive.get(item.parentSourceDriveId) ?? null
      : null;
    const existingIndex = articleByDrive.get(item.sourceDriveId);

    if (existingIndex != null) {
      const current = snapshot.articles[existingIndex]!;
      if (
        current.title !== item.title ||
        current.body !== item.body ||
        current.folderId !== folderId
      ) {
        snapshot.articles[existingIndex] = {
          ...current,
          title: item.title,
          body: item.body,
          folderId,
          sourceMimeType: item.sourceMimeType,
          updatedAt: now,
          updatedByName: input.updatedByName ?? "Import",
        };
        updated += 1;
      }
    } else {
      snapshot.articles.unshift({
        id: randomUUID(),
        libraryId: CLIENT_KB_LIBRARY_ID,
        folderId,
        title: item.title,
        body: item.body,
        status: "published",
        sourceDriveId: item.sourceDriveId,
        sourceMimeType: item.sourceMimeType,
        updatedByUserId: null,
        updatedByName: input.updatedByName ?? "Import",
        createdAt: now,
        updatedAt: now,
      });
      articlesTouched += 1;
    }
  }

  await saveKbSnapshot(snapshot);
  return {
    folders: foldersTouched,
    articles: articlesTouched,
    updated,
  };
}
