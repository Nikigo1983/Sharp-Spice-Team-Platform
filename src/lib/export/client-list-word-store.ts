import "server-only";

import { randomBytes } from "node:crypto";
import { getAppState, setAppState } from "@/lib/supabase/app-state";

const KEY_PREFIX = "export:client-list-word:";
const TTL_MS = 10 * 60 * 1000;

export type ClientListWordStoredExport = {
  html: string;
  filename: string;
  expiresAt: number;
};

function storageKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

/** Short unguessable id — keeps the Word ms-word: URL under Office length limits. */
export function mintClientListWordExportId(): string {
  return randomBytes(12).toString("base64url");
}

export async function saveClientListWordExport(
  id: string,
  payload: Omit<ClientListWordStoredExport, "expiresAt">,
): Promise<boolean> {
  try {
    return await setAppState(storageKey(id), {
      html: payload.html,
      filename: payload.filename,
      expiresAt: Date.now() + TTL_MS,
    } satisfies ClientListWordStoredExport);
  } catch (error) {
    console.error("[client-list-word-store] save failed", error);
    return false;
  }
}

export async function loadClientListWordExport(
  id: string,
): Promise<ClientListWordStoredExport | null> {
  const safeId = id.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(safeId)) return null;

  try {
    const stored = await getAppState<ClientListWordStoredExport>(
      storageKey(safeId),
    );
    if (!stored?.html || typeof stored.expiresAt !== "number") return null;
    if (stored.expiresAt < Date.now()) return null;
    return stored;
  } catch (error) {
    console.error("[client-list-word-store] load failed", error);
    return null;
  }
}

export function buildClientListWordFileUrl(origin: string, id: string): string {
  return `${origin}/api/exports/list-word/${id}/document.doc`;
}

export function buildClientListWordLaunchUrl(
  origin: string,
  id: string,
): string {
  return `${origin}/api/exports/list-word/office-launch?t=${encodeURIComponent(id)}`;
}
