export const CLIENT_KB_LIBRARY_ID = "lib-client-knowledge";
export const CLIENT_KB_LIBRARY_SLUG = "client_knowledge";
export const CLIENT_KB_LIBRARY_TITLE = "База знаний для клиентов";

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
    };
