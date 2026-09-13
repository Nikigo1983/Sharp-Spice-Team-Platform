export const CLIENT_KB_LIBRARY_ID = "lib-client-knowledge";
export const CLIENT_KB_LIBRARY_SLUG = "client_knowledge";
export const CLIENT_KB_LIBRARY_TITLE = "База знаний для клиентов";

export const COMPANY_KB_LIBRARY_ID = "lib-company-knowledge";
export const COMPANY_KB_LIBRARY_SLUG = "company_knowledge";
export const COMPANY_KB_LIBRARY_TITLE = "База знаний для компании";

export type KbLibrarySlug = "client_knowledge" | "company_knowledge";

export type KbArticleKind = "text" | "file";

export type KbFolder = {
  id: string;
  libraryId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  sourceDriveId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KbArticle = {
  id: string;
  libraryId: string;
  folderId: string | null;
  title: string;
  body: string;
  status: "draft" | "published";
  kind: KbArticleKind;
  /** Private Storage object path inside knowledge-base bucket */
  storagePath: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  sourceDriveId: string | null;
  sourceMimeType: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KbLibrarySnapshot = {
  library: {
    id: string;
    slug: string;
    title: string;
    updatedAt: string;
  };
  folders: KbFolder[];
  articles: KbArticle[];
};

export type KbListingItem =
  | {
      kind: "folder";
      id: string;
      name: string;
      updatedAt: string;
    }
  | {
      kind: "article";
      id: string;
      name: string;
      updatedAt: string;
      preview: string;
      articleKind: KbArticleKind;
      mimeType: string | null;
    };

export function libraryMeta(slug: KbLibrarySlug): {
  id: string;
  slug: KbLibrarySlug;
  title: string;
  appStateKey: string;
  localFile: string;
} {
  if (slug === "company_knowledge") {
    return {
      id: COMPANY_KB_LIBRARY_ID,
      slug: COMPANY_KB_LIBRARY_SLUG,
      title: COMPANY_KB_LIBRARY_TITLE,
      appStateKey: "platform_company_knowledge_base_v1",
      localFile: "platform-company-kb.json",
    };
  }
  return {
    id: CLIENT_KB_LIBRARY_ID,
    slug: CLIENT_KB_LIBRARY_SLUG,
    title: CLIENT_KB_LIBRARY_TITLE,
    appStateKey: "platform_knowledge_base_v1",
    localFile: "platform-kb.json",
  };
}

export function parseLibrarySlug(value: string | null | undefined): KbLibrarySlug {
  return value === "company_knowledge" ? "company_knowledge" : "client_knowledge";
}
