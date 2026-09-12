import "server-only";

import { getSupabaseAdmin } from "./server";
import type { ClientDocument } from "@/lib/google-sheets/types";

type DocumentRow = {
  id: string;
  client_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
};

export function mapDocumentRow(row: DocumentRow): ClientDocument {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.file_name,
    fileName: row.file_name,
    uploadedAt: row.created_at,
    category: "Загружено",
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    source: "upload",
  };
}

export async function sbListClientDocuments(
  clientId: string,
): Promise<ClientDocument[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_documents")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as DocumentRow[]).map(mapDocumentRow);
}

export async function sbGetClientDocument(
  documentId: string,
  clientId: string,
): Promise<ClientDocument | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_documents")
    .select("*")
    .eq("id", documentId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapDocumentRow(data as DocumentRow);
}

export async function sbInsertClientDocument(
  doc: ClientDocument,
): Promise<ClientDocument> {
  if (!doc.fileName || !doc.contentType || doc.sizeBytes == null || !doc.uploadedBy) {
    throw new Error("Incomplete document metadata");
  }

  const { data, error } = await getSupabaseAdmin()
    .from("client_documents")
    .insert({
      id: doc.id,
      client_id: doc.clientId,
      file_name: doc.fileName,
      content_type: doc.contentType,
      size_bytes: doc.sizeBytes,
      uploaded_by: doc.uploadedBy,
      created_at: doc.uploadedAt,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapDocumentRow(data as DocumentRow);
}

export async function sbDeleteClientDocument(
  documentId: string,
  clientId: string,
): Promise<ClientDocument | null> {
  const existing = await sbGetClientDocument(documentId, clientId);
  if (!existing) return null;

  const { error } = await getSupabaseAdmin()
    .from("client_documents")
    .delete()
    .eq("id", documentId)
    .eq("client_id", clientId);

  if (error) throw error;
  return existing;
}

export async function sbCountClientDocuments(clientId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("client_documents")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);

  if (error) throw error;
  return count ?? 0;
}
