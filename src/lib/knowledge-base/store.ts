import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAppState, setAppState } from "@/lib/supabase/app-state";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  CLIENT_KB_LIBRARY_ID,
  CLIENT_KB_LIBRARY_SLUG,
  CLIENT_KB_LIBRARY_TITLE,
  type KbArticle,
  type KbFolder,
  type KbLibrarySnapshot,
} from "./types";

const APP_STATE_KEY = "platform_knowledge_base_v1";
const LOCAL_PATH = path.join(process.cwd(), ".data", "platform-kb.json");

function emptySnapshot(now = new Date().toISOString()): KbLibrarySnapshot {
  return {
    library: {
      id: CLIENT_KB_LIBRARY_ID,
      slug: CLIENT_KB_LIBRARY_SLUG,
      title: CLIENT_KB_LIBRARY_TITLE,
      updatedAt: now,
    },
    folders: [],
    articles: [],
  };
}

function normalizeSnapshot(raw: unknown): KbLibrarySnapshot {
  if (!raw || typeof raw !== "object") return emptySnapshot();
  const obj = raw as Partial<KbLibrarySnapshot>;
  return {
    library: {
      id: obj.library?.id || CLIENT_KB_LIBRARY_ID,
      slug: obj.library?.slug || CLIENT_KB_LIBRARY_SLUG,
      title: obj.library?.title || CLIENT_KB_LIBRARY_TITLE,
      updatedAt: obj.library?.updatedAt || new Date().toISOString(),
    },
    folders: Array.isArray(obj.folders) ? obj.folders : [],
    articles: Array.isArray(obj.articles) ? obj.articles : [],
  };
}

async function readLocal(): Promise<KbLibrarySnapshot> {
  try {
    const text = await readFile(LOCAL_PATH, "utf8");
    return normalizeSnapshot(JSON.parse(text));
  } catch {
    return emptySnapshot();
  }
}

async function writeLocal(snapshot: KbLibrarySnapshot): Promise<void> {
  await mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await writeFile(LOCAL_PATH, JSON.stringify(snapshot, null, 2), "utf8");
}

type FolderRow = {
  id: string;
  library_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  source_drive_id: string | null;
  created_at: string;
  updated_at: string;
};

type ArticleRow = {
  id: string;
  library_id: string;
  folder_id: string | null;
  title: string;
  body: string;
  status: "draft" | "published";
  source_drive_id: string | null;
  source_mime_type: string | null;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
};

function folderFromRow(row: FolderRow): KbFolder {
  return {
    id: row.id,
    libraryId: row.library_id,
    parentId: row.parent_id,
    name: row.name,
    sortOrder: row.sort_order,
    sourceDriveId: row.source_drive_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function articleFromRow(row: ArticleRow): KbArticle {
  return {
    id: row.id,
    libraryId: row.library_id,
    folderId: row.folder_id,
    title: row.title,
    body: row.body,
    status: row.status,
    sourceDriveId: row.source_drive_id,
    sourceMimeType: row.source_mime_type,
    updatedByUserId: row.updated_by_user_id,
    updatedByName: row.updated_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readFromTables(): Promise<KbLibrarySnapshot | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabaseAdmin();
    const { data: library, error: libError } = await sb
      .from("kb_libraries")
      .select("id, slug, title, updated_at")
      .eq("id", CLIENT_KB_LIBRARY_ID)
      .maybeSingle();
    if (libError) return null;

    const [{ data: folders, error: foldersError }, { data: articles, error: articlesError }] =
      await Promise.all([
        sb
          .from("kb_folders")
          .select("*")
          .eq("library_id", CLIENT_KB_LIBRARY_ID)
          .order("sort_order", { ascending: true }),
        sb
          .from("kb_articles")
          .select("*")
          .eq("library_id", CLIENT_KB_LIBRARY_ID)
          .order("updated_at", { ascending: false }),
      ]);

    if (foldersError || articlesError) return null;

    const now = new Date().toISOString();
    return {
      library: {
        id: library?.id ?? CLIENT_KB_LIBRARY_ID,
        slug: library?.slug ?? CLIENT_KB_LIBRARY_SLUG,
        title: library?.title ?? CLIENT_KB_LIBRARY_TITLE,
        updatedAt: library?.updated_at ?? now,
      },
      folders: ((folders ?? []) as FolderRow[]).map(folderFromRow),
      articles: ((articles ?? []) as ArticleRow[]).map(articleFromRow),
    };
  } catch {
    return null;
  }
}

async function writeToTables(snapshot: KbLibrarySnapshot): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const sb = getSupabaseAdmin();
    const { error: libError } = await sb.from("kb_libraries").upsert(
      {
        id: snapshot.library.id,
        slug: snapshot.library.slug,
        title: snapshot.library.title,
        updated_at: snapshot.library.updatedAt,
      },
      { onConflict: "id" },
    );
    if (libError) return false;

    // Replace library contents for simplicity (migrate + edits go through snapshot write).
    await sb.from("kb_articles").delete().eq("library_id", CLIENT_KB_LIBRARY_ID);
    await sb.from("kb_folders").delete().eq("library_id", CLIENT_KB_LIBRARY_ID);

    if (snapshot.folders.length > 0) {
      const { error } = await sb.from("kb_folders").insert(
        snapshot.folders.map((folder) => ({
          id: folder.id,
          library_id: folder.libraryId,
          parent_id: folder.parentId,
          name: folder.name,
          sort_order: folder.sortOrder,
          source_drive_id: folder.sourceDriveId,
          created_at: folder.createdAt,
          updated_at: folder.updatedAt,
        })),
      );
      if (error) return false;
    }

    if (snapshot.articles.length > 0) {
      const { error } = await sb.from("kb_articles").insert(
        snapshot.articles.map((article) => ({
          id: article.id,
          library_id: article.libraryId,
          folder_id: article.folderId,
          title: article.title,
          body: article.body,
          status: article.status,
          source_drive_id: article.sourceDriveId,
          source_mime_type: article.sourceMimeType,
          updated_by_user_id: article.updatedByUserId,
          updated_by_name: article.updatedByName,
          created_at: article.createdAt,
          updated_at: article.updatedAt,
        })),
      );
      if (error) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function loadKbSnapshot(): Promise<KbLibrarySnapshot> {
  if (isSupabaseConfigured()) {
    const fromState = await getAppState<KbLibrarySnapshot>(APP_STATE_KEY);
    if (fromState) return normalizeSnapshot(fromState);
  }

  const fromTables = await readFromTables();
  if (fromTables && (fromTables.articles.length > 0 || fromTables.folders.length > 0)) {
    return fromTables;
  }

  return readLocal();
}

export async function saveKbSnapshot(
  snapshot: KbLibrarySnapshot,
): Promise<void> {
  const next: KbLibrarySnapshot = {
    ...snapshot,
    library: {
      ...snapshot.library,
      updatedAt: new Date().toISOString(),
    },
  };

  // Primary store: app_state (works without DDL) + local file.
  if (isSupabaseConfigured()) {
    await setAppState(APP_STATE_KEY, next);
  }
  // Best-effort structured tables if migration 026 is applied.
  void writeToTables(next);
  await writeLocal(next);
}
