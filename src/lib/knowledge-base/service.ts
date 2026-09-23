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

export async function createKnowledgeFileArticle(input: {
  slug: KbLibrarySlug;
  folderId?: string | null;
  fileName: string;
  contentType: string;
  data: Buffer;
  title?: string;
  updatedByUserId: string;
  updatedByName: string;
}): Promise<KbArticle> {
  const fileName = input.fileName.trim().slice(0, 255);
  if (!fileName) throw new Error("INVALID_FILE");
  if (!input.data.length) throw new Error("EMPTY_FILE");

  const { MAX_KB_FILE_BYTES, kbStorageObjectPath, saveKnowledgeBaseFile } =
    await import("./asset-storage");
  if (input.data.length > MAX_KB_FILE_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }

  const meta = libraryMeta(input.slug);
  const snapshot = await getLibrary(input.slug);
  const folderId = input.folderId ?? null;
  if (folderId && !snapshot.folders.some((f) => f.id === folderId)) {
    throw new Error("FOLDER_NOT_FOUND");
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const storagePath = kbStorageObjectPath(input.slug, id, fileName);
  const mime =
    input.contentType.split(";")[0]?.trim() || "application/octet-stream";

  await saveKnowledgeBaseFile(storagePath, input.data, mime);

  const title = (input.title?.trim() || fileName.replace(/\.[^.]+$/, "") || fileName).slice(
    0,
    200,
  );

  const article: KbArticle = {
    id,
    libraryId: meta.id,
    folderId,
    title,
    body: "",
    status: "published",
    kind: "file",
    storagePath,
    fileName,
    sizeBytes: input.data.length,
    sourceDriveId: null,
    sourceMimeType: mime,
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

export async function deleteKnowledgeFolder(
  slug: KbLibrarySlug,
  folderId: string,
): Promise<void> {
  const snapshot = await getLibrary(slug);
  if (!snapshot.folders.some((f) => f.id === folderId)) {
    throw new Error("NOT_FOUND");
  }

  const removeFolderIds = new Set<string>();
  const queue = [folderId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (removeFolderIds.has(currentId)) continue;
    removeFolderIds.add(currentId);
    for (const child of snapshot.folders) {
      if (child.parentId === currentId) queue.push(child.id);
    }
  }

  const { deleteKnowledgeBaseFile } = await import("./asset-storage");
  const remainingArticles: KbArticle[] = [];
  for (const article of snapshot.articles) {
    if (article.folderId && removeFolderIds.has(article.folderId)) {
      if (article.storagePath) {
        await deleteKnowledgeBaseFile(article.storagePath);
      }
      continue;
    }
    remainingArticles.push(article);
  }

  await saveKbSnapshot(
    {
      ...snapshot,
      folders: snapshot.folders.filter((f) => !removeFolderIds.has(f.id)),
      articles: remainingArticles,
    },
    slug,
  );
}

export async function deleteClientKnowledgeArticle(id: string): Promise<void> {
  return deleteKnowledgeArticle("client_knowledge", id);
}
