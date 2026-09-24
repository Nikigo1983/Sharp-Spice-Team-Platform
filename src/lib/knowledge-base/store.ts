import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAppState, setAppState } from "@/lib/supabase/app-state";
import {
  libraryMeta,
  type KbArticle,
  type KbLibrarySlug,
  type KbLibrarySnapshot,
} from "./types";

function emptySnapshot(slug: KbLibrarySlug, now = new Date().toISOString()): KbLibrarySnapshot {
  const meta = libraryMeta(slug);
  return {
    library: {
      id: meta.id,
      slug: meta.slug,
      title: meta.title,
      updatedAt: now,
    },
    folders: [],
    articles: [],
  };
}

function normalizeArticle(raw: Partial<KbArticle>): KbArticle {
  return {
    id: String(raw.id ?? ""),
    libraryId: String(raw.libraryId ?? ""),
    folderId: raw.folderId ?? null,
    title: String(raw.title ?? ""),
    body: String(raw.body ?? ""),
    status: raw.status === "draft" ? "draft" : "published",
    kind: raw.kind === "file" ? "file" : "text",
    storagePath: raw.storagePath ?? null,
    fileName: raw.fileName ?? null,
    sizeBytes: typeof raw.sizeBytes === "number" ? raw.sizeBytes : null,
    sourceDriveId: raw.sourceDriveId ?? null,
    sourceMimeType: raw.sourceMimeType ?? null,
    updatedByUserId: raw.updatedByUserId ?? null,
    updatedByName: raw.updatedByName ?? null,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
  };
}

function normalizeSnapshot(
  slug: KbLibrarySlug,
  raw: unknown,
): KbLibrarySnapshot {
  const meta = libraryMeta(slug);
  if (!raw || typeof raw !== "object") return emptySnapshot(slug);
  const obj = raw as Partial<KbLibrarySnapshot>;
  return {
    library: {
      id: obj.library?.id || meta.id,
      slug: obj.library?.slug || meta.slug,
      title: obj.library?.title || meta.title,
      updatedAt: obj.library?.updatedAt || new Date().toISOString(),
    },
    folders: Array.isArray(obj.folders) ? obj.folders : [],
    articles: Array.isArray(obj.articles)
      ? obj.articles.map((a) => normalizeArticle(a as Partial<KbArticle>))
      : [],
  };
}

async function readLocal(slug: KbLibrarySlug): Promise<KbLibrarySnapshot> {
  const meta = libraryMeta(slug);
  const localPath = path.join(process.cwd(), ".data", meta.localFile);
  try {
    const text = await readFile(localPath, "utf8");
    return normalizeSnapshot(slug, JSON.parse(text));
  } catch {
    return emptySnapshot(slug);
  }
}

async function writeLocal(
  slug: KbLibrarySlug,
  snapshot: KbLibrarySnapshot,
): Promise<void> {
  const meta = libraryMeta(slug);
  const localPath = path.join(process.cwd(), ".data", meta.localFile);
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, JSON.stringify(snapshot, null, 2), "utf8");
}

export async function loadKbSnapshot(
  slug: KbLibrarySlug = "client_knowledge",
): Promise<KbLibrarySnapshot> {
  const meta = libraryMeta(slug);
  if (isSupabaseConfigured()) {
    const fromState = await getAppState<KbLibrarySnapshot>(meta.appStateKey);
    if (fromState) return normalizeSnapshot(slug, fromState);
  }
  return readLocal(slug);
}

export async function saveKbSnapshot(
  snapshot: KbLibrarySnapshot,
  slug?: KbLibrarySlug,
): Promise<void> {
  const resolvedSlug: KbLibrarySlug =
    slug ??
    (snapshot.library.slug === "company_knowledge"
      ? "company_knowledge"
      : "client_knowledge");
  const meta = libraryMeta(resolvedSlug);
  const next: KbLibrarySnapshot = {
    ...snapshot,
    library: {
      ...snapshot.library,
      id: meta.id,
      slug: meta.slug,
      title: meta.title,
      updatedAt: new Date().toISOString(),
    },
  };

  // Production (Vercel): /var/task is read-only. Persist to Supabase app_state
  // and treat local .data/ as best-effort mirror for local/dev only.
  if (isSupabaseConfigured()) {
    const ok = await setAppState(meta.appStateKey, next);
    if (!ok) {
      throw new Error("KB_STATE_SAVE_FAILED");
    }
    try {
      await writeLocal(resolvedSlug, next);
    } catch (error) {
      console.warn(
        "[knowledge-base] local mirror skipped:",
        error instanceof Error ? error.message : error,
      );
    }
    return;
  }

  await writeLocal(resolvedSlug, next);
}
