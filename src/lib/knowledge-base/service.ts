import "server-only";

import { randomUUID } from "node:crypto";
import { loadKbSnapshot, saveKbSnapshot } from "./store";
import {
  libraryMeta,
  parseLibrarySlug,
  type KbArticle,
  type KbFolder,
  type KbLibrarySlug,
  type KbLibrarySnapshot,
  type KbListingItem,
} from "./types";

export { parseLibrarySlug };

function previewText(body: string, max = 120): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

async function getLibrary(
  slug: KbLibrarySlug,
): Promise<KbLibrarySnapshot> {
  const meta = libraryMeta(slug);
  const snapshot = await loadKbSnapshot(slug);
  return {
    ...snapshot,
    library: {
      id: meta.id,
      slug: meta.slug,
      title: meta.title,
      updatedAt: snapshot.library.updatedAt,
    },
  };
}

export async function getClientKnowledgeLibrary(): Promise<KbLibrarySnapshot> {
  return getLibrary("client_knowledge");
}

export async function getCompanyKnowledgeLibrary(): Promise<KbLibrarySnapshot> {
  return getLibrary("company_knowledge");
}

export async function listKnowledgeFolder(
  slug: KbLibrarySlug,
  folderId: string | null,
): Promise<{
  libraryTitle: string;
  librarySlug: KbLibrarySlug;
  folderId: string | null;
  folderName: string;
  parentId: string | null;
  items: KbListingItem[];
}> {
  const snapshot = await getLibrary(slug);
  const folders = snapshot.folders.filter((f) => f.parentId === folderId);
  const articles = snapshot.articles.filter((a) => a.folderId === folderId);
  const current = folderId
    ? snapshot.folders.find((f) => f.id === folderId) ?? null
    : null;

  const items: KbListingItem[] = [
    ...folders
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"),
      )
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
        preview:
          article.kind === "file"
            ? article.fileName || article.sourceMimeType || "Файл"
            : previewText(article.body),
        articleKind: article.kind,
        mimeType: article.sourceMimeType,
      })),
  ];

  return {
    libraryTitle: snapshot.library.title,
    librarySlug: slug,
    folderId,
    folderName: current?.name ?? snapshot.library.title,
    parentId: current?.parentId ?? null,
    items,
  };
}

export async function listClientKnowledgeFolder(folderId: string | null) {
  return listKnowledgeFolder("client_knowledge", folderId);
}

export async function getKnowledgeArticle(
  slug: KbLibrarySlug,
  id: string,
): Promise<KbArticle | null> {
  const snapshot = await getLibrary(slug);
  return snapshot.articles.find((article) => article.id === id) ?? null;
}

export async function getClientKnowledgeArticle(
  id: string,
): Promise<KbArticle | null> {
  return getKnowledgeArticle("client_knowledge", id);
}

export async function createKnowledgeFolder(input: {
  slug: KbLibrarySlug;
  name: string;
  parentId?: string | null;
}): Promise<KbFolder> {
  const name = input.name.trim();
  if (!name) throw new Error("INVALID_NAME");

  const meta = libraryMeta(input.slug);
  const snapshot = await getLibrary(input.slug);
  const parentId = input.parentId ?? null;
  if (parentId && !snapshot.folders.some((f) => f.id === parentId)) {
    throw new Error("FOLDER_NOT_FOUND");
  }

  const now = new Date().toISOString();
  const folder: KbFolder = {
    id: randomUUID(),
    libraryId: meta.id,
    parentId,
    name,
    sortOrder: snapshot.folders.filter((f) => f.parentId === parentId).length,
    sourceDriveId: null,
    createdAt: now,
    updatedAt: now,
  };

  await saveKbSnapshot(
    { ...snapshot, folders: [...snapshot.folders, folder] },
    input.slug,
  );
  return folder;
}

export async function createClientKnowledgeFolder(input: {
  name: string;
  parentId?: string | null;
}): Promise<KbFolder> {
  return createKnowledgeFolder({
    slug: "client_knowledge",
    name: input.name,
    parentId: input.parentId,
  });
}

export async function createKnowledgeArticle(input: {
  slug: KbLibrarySlug;
  title: string;
  body?: string;
  folderId?: string | null;
  updatedByUserId: string;
  updatedByName: string;
}): Promise<KbArticle> {
  const title = input.title.trim();
  if (!title) throw new Error("INVALID_TITLE");

  const meta = libraryMeta(input.slug);
  const snapshot = await getLibrary(input.slug);
  const folderId = input.folderId ?? null;
  if (folderId && !snapshot.folders.some((f) => f.id === folderId)) {
    throw new Error("FOLDER_NOT_FOUND");
  }

  const now = new Date().toISOString();
  const article: KbArticle = {
    id: randomUUID(),
    libraryId: meta.id,
    folderId,
    title,
    body: input.body ?? "",
    status: "published",
    kind: "text",
    storagePath: null,
    fileName: null,
    sizeBytes: null,
    sourceDriveId: null,
    sourceMimeType: null,
    updatedByUserId: input.updatedByUserId,
    updatedByName: input.updatedByName,
    createdAt: now,
    updatedAt: now,
  };

  await saveKbSnapshot(
    { ...snapshot, articles: [article, ...snapshot.articles] },
    input.slug,
  );
  return article;
}

export async function createClientKnowledgeArticle(input: {
  title: string;
  body?: string;
  folderId?: string | null;
  updatedByUserId: string;
  updatedByName: string;
}): Promise<KbArticle> {
  return createKnowledgeArticle({
    slug: "client_knowledge",
    ...input,
  });
}

export async function updateKnowledgeArticle(input: {
  slug: KbLibrarySlug;
  id: string;
  title?: string;
  body?: string;
  folderId?: string | null;
  updatedByUserId: string;
  updatedByName: string;
}): Promise<KbArticle> {
  const snapshot = await getLibrary(input.slug);
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
    folderId: input.folderId === undefined ? current.folderId : input.folderId,
    updatedByUserId: input.updatedByUserId,
    updatedByName: input.updatedByName,
    updatedAt: now,
  };

  const articles = snapshot.articles.slice();
  articles[index] = next;
  await saveKbSnapshot({ ...snapshot, articles }, input.slug);
  return next;
}

export async function updateClientKnowledgeArticle(input: {
  id: string;
  title?: string;
  body?: string;
  folderId?: string | null;
  updatedByUserId: string;
  updatedByName: string;
}): Promise<KbArticle> {
  return updateKnowledgeArticle({ slug: "client_knowledge", ...input });
}

export async function deleteKnowledgeArticle(
  slug: KbLibrarySlug,
  id: string,
): Promise<void> {
  const snapshot = await getLibrary(slug);
  const article = snapshot.articles.find((a) => a.id === id);
  if (!article) throw new Error("NOT_FOUND");

  if (article.storagePath) {
    const { deleteKnowledgeBaseFile } = await import("./asset-storage");
    await deleteKnowledgeBaseFile(article.storagePath);
  }

  await saveKbSnapshot(
    {
      ...snapshot,
      articles: snapshot.articles.filter((a) => a.id !== id),
    },
    slug,
  );
}

export async function deleteClientKnowledgeArticle(id: string): Promise<void> {
  return deleteKnowledgeArticle("client_knowledge", id);
}

/** Merge imported folders/articles (idempotent by sourceDriveId). */
export async function upsertImportedKnowledge(input: {
  slug?: KbLibrarySlug;
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
    kind?: "text" | "file";
    storagePath?: string | null;
    fileName?: string | null;
    sizeBytes?: number | null;
  }>;
  updatedByName?: string;
}): Promise<{ folders: number; articles: number; updated: number }> {
  const slug = input.slug ?? "client_knowledge";
  const meta = libraryMeta(slug);
  const snapshot = await getLibrary(slug);
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
          libraryId: meta.id,
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
    const kind = item.kind ?? (item.storagePath ? "file" : "text");

    if (existingIndex != null) {
      const current = snapshot.articles[existingIndex]!;
      if (
        current.title !== item.title ||
        current.body !== item.body ||
        current.folderId !== folderId ||
        current.storagePath !== (item.storagePath ?? current.storagePath) ||
        current.kind !== kind
      ) {
        snapshot.articles[existingIndex] = {
          ...current,
          title: item.title,
          body: item.body,
          folderId,
          kind,
          storagePath: item.storagePath ?? current.storagePath,
          fileName: item.fileName ?? current.fileName,
          sizeBytes: item.sizeBytes ?? current.sizeBytes,
          sourceMimeType: item.sourceMimeType,
          updatedAt: now,
          updatedByName: input.updatedByName ?? "Import",
        };
        updated += 1;
      }
    } else {
      snapshot.articles.unshift({
        id: randomUUID(),
        libraryId: meta.id,
        folderId,
        title: item.title,
        body: item.body,
        status: "published",
        kind,
        storagePath: item.storagePath ?? null,
        fileName: item.fileName ?? null,
        sizeBytes: item.sizeBytes ?? null,
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

  await saveKbSnapshot(snapshot, slug);
  return {
    folders: foldersTouched,
    articles: articlesTouched,
    updated,
  };
}
