import "server-only";

import { getSupabaseAdmin } from "./server";
import type { ClientNote } from "@/lib/google-sheets/types";

type NoteRow = {
  id: string;
  client_id: string;
  author: string;
  text: string;
  created_at: string;
};

function mapNote(row: NoteRow): ClientNote {
  return {
    id: row.id,
    clientId: row.client_id,
    author: row.author,
    text: row.text,
    createdAt: row.created_at,
  };
}

export async function sbListClientNotes(clientId: string): Promise<ClientNote[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_notes")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as NoteRow[]).map(mapNote);
}

export async function sbInsertClientNote(note: ClientNote): Promise<ClientNote> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_notes")
    .insert({
      id: note.id,
      client_id: note.clientId,
      author: note.author,
      text: note.text,
      created_at: note.createdAt,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapNote(data as NoteRow);
}

export async function sbUpdateClientNote(
  noteId: string,
  clientId: string,
  text: string,
): Promise<boolean> {
  const { error, count } = await getSupabaseAdmin()
    .from("client_notes")
    .update({ text })
    .eq("id", noteId)
    .eq("client_id", clientId);

  if (error) throw error;
  return (count ?? 0) > 0;
}
