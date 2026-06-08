import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ClientNote } from "./types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbNotes from "@/lib/supabase/client-notes-repo";

const STORE_PATH = path.join(process.cwd(), ".data", "client-notes.json");

type NotesStore = {
  notes: ClientNote[];
};

async function readStore(): Promise<NotesStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as NotesStore;
    if (!Array.isArray(data.notes)) return { notes: [] };
    return data;
  } catch {
    return { notes: [] };
  }
}

async function writeStore(store: NotesStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function listLocalNotesByClientId(
  clientId: string,
): Promise<ClientNote[]> {
  if (isSupabaseConfigured()) {
    try {
      return await sbNotes.sbListClientNotes(clientId);
    } catch (error) {
      console.error("[client-notes] supabase list", error);
      return [];
    }
  }

  const store = await readStore();
  return store.notes
    .filter((note) => note.clientId === clientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function appendLocalNote(
  clientId: string,
  author: string,
  text: string,
): Promise<boolean> {
  const note: ClientNote = {
    id: `NT-${randomUUID()}`,
    clientId,
    createdAt: new Date().toISOString(),
    author,
    text,
  };

  if (isSupabaseConfigured()) {
    try {
      await sbNotes.sbInsertClientNote(note);
      return true;
    } catch (error) {
      console.error("[client-notes] supabase append", error);
      return false;
    }
  }

  const store = await readStore();
  store.notes.push(note);
  await writeStore(store);
  return true;
}

export async function updateLocalNote(
  noteId: string,
  clientId: string,
  text: string,
): Promise<boolean> {
  if (isSupabaseConfigured()) {
    try {
      return await sbNotes.sbUpdateClientNote(noteId, clientId, text);
    } catch (error) {
      console.error("[client-notes] supabase update", error);
      return false;
    }
  }

  const store = await readStore();
  const note = store.notes.find(
    (item) => item.id === noteId && item.clientId === clientId,
  );
  if (!note) return false;
  note.text = text;
  await writeStore(store);
  return true;
}
