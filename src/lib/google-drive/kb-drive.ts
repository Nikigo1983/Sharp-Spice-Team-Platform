import { fetchWithTlsFallback } from "@/lib/google-fetch";
import { getGoogleAccessToken, isGoogleDriveKbConfigured } from "@/lib/google-sheets/auth";
import { getCached, setCached } from "@/lib/google-sheets/cache";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveKbItem = {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  modifiedTime: string;
  webViewLink: string;
  sizeLabel: string;
};

export type DriveKbListing = {
  folderId: string;
  folderName: string;
  parentId: string | null;
  rootFolderId: string;
  items: DriveKbItem[];
  source: "google_drive" | "unconfigured" | "error";
  errorMessage?: string;
};

function getRootFolderId(): string {
  return process.env.GOOGLE_DRIVE_KB_FOLDER_ID!.trim();
}

function formatSize(bytes?: string): string {
  if (!bytes) return "—";
  const n = Number(bytes);
  if (Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeLabel(mimeType: string): string {
  if (mimeType === FOLDER_MIME) return "Папка";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return "Таблица";
  }
  if (mimeType.includes("document") || mimeType.includes("word")) {
    return "Документ";
  }
  return "Файл";
}

async function driveFetch<T>(path: string): Promise<T | null> {
  const token = await getGoogleAccessToken();
  if (!token) return null;

  try {
    const response = await fetchWithTlsFallback(`${DRIVE_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error("[google-drive] fetch error", path, await response.text());
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error("[google-drive] fetch failed", path, error);
    return null;
  }
}

async function getFolderMeta(
  folderId: string,
): Promise<{ name: string; parentId: string | null } | null> {
  const data = await driveFetch<{
    name?: string;
    parents?: string[];
  }>(
    `/files/${folderId}?fields=name,parents&supportsAllDrives=true`,
  );
  if (!data?.name) return null;
  return {
    name: data.name,
    parentId: data.parents?.[0] ?? null,
  };
}

export async function listKnowledgeBaseFolder(
  folderId?: string,
): Promise<DriveKbListing> {
  const rootFolderId = getRootFolderId();

  if (!isGoogleDriveKbConfigured()) {
    return {
      folderId: rootFolderId,
      folderName: "Knowledge Base",
      parentId: null,
      rootFolderId,
      items: [],
      source: "unconfigured",
    };
  }

  const currentId = folderId?.trim() || rootFolderId;
  const cacheKey = `drive-kb:${currentId}`;
  const cached = getCached<DriveKbListing>(cacheKey);
  if (cached) return cached;

  const [meta, filesData] = await Promise.all([
    getFolderMeta(currentId),
    driveFetch<{
      files?: Array<{
        id: string;
        name: string;
        mimeType: string;
        modifiedTime?: string;
        webViewLink?: string;
        size?: string;
      }>;
    }>(
      `/files?q=${encodeURIComponent(`'${currentId}' in parents and trashed=false`)}&fields=files(id,name,mimeType,modifiedTime,webViewLink,size)&orderBy=folder,name&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    ),
  ]);

  const rootMeta = currentId === rootFolderId ? meta : await getFolderMeta(rootFolderId);
  const parentId = meta?.parentId ?? null;
  const safeParent =
    parentId && parentId !== currentId && currentId !== rootFolderId
      ? parentId
      : currentId === rootFolderId
        ? null
        : rootFolderId;

  const items: DriveKbItem[] = (filesData?.files ?? []).map((file) => {
    const isFolder = file.mimeType === FOLDER_MIME;
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      isFolder,
      modifiedTime: file.modifiedTime
        ? new Date(file.modifiedTime).toLocaleDateString("ru-RU")
        : "—",
      webViewLink:
        file.webViewLink ??
        (isFolder
          ? `https://drive.google.com/drive/folders/${file.id}`
          : `https://drive.google.com/file/d/${file.id}/view`),
      sizeLabel: isFolder ? mimeLabel(file.mimeType) : formatSize(file.size),
    };
  });

  items.sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  });

  const hasData = Boolean(meta || filesData);
  const result: DriveKbListing = {
    folderId: currentId,
    folderName: meta?.name ?? rootMeta?.name ?? "Knowledge Base",
    parentId: safeParent,
    rootFolderId,
    items,
    source: hasData ? "google_drive" : "error",
    errorMessage: hasData
      ? undefined
      : "Не удалось подключиться к Google Drive. Проверьте доступ service account к папке.",
  };

  if (hasData) setCached(cacheKey, result, 30_000);
  return result;
}

export function getKnowledgeBaseRootUrl(): string {
  const id = process.env.GOOGLE_DRIVE_KB_FOLDER_ID?.trim();
  return id
    ? `https://drive.google.com/drive/folders/${id}`
    : "https://drive.google.com";
}
