import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ClientDocument } from "@/lib/google-sheets/types";
import {
  MAX_CLIENT_DOCUMENT_BYTES,
  MAX_CLIENT_DOCUMENTS_PER_CLIENT,
  isAllowedClientDocument,
  normalizeClientDocumentContentType,
} from "@/lib/clients/document-formats";
import {
  deleteClientDocumentFile,
  saveClientDocumentFile,
} from "@/lib/clients/document-storage";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbDocs from "@/lib/supabase/client-documents-repo";

const STORE_PATH = path.join(process.cwd(), ".data", "client-documents.json");

type DocumentsStore = {
  documents: ClientDocument[];
};

async function readStore(): Promise<DocumentsStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as DocumentsStore;
    if (!Array.isArray(data.documents)) return { documents: [] };
    return data;
  } catch {
    return { documents: [] };
  }
}

async function writeStore(store: DocumentsStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function normalizeStored(doc: ClientDocument): ClientDocument {
  return {
    ...doc,
    fileName: doc.fileName ?? doc.name,
    source: doc.source ?? "upload",
    category: doc.category || "Загружено",
  };
}

export async function listClientUploadedDocuments(
  clientId: string,
): Promise<ClientDocument[]> {
  if (isSupabaseConfigured()) {
    try {
      return await sbDocs.sbListClientDocuments(clientId);
    } catch (error) {
      console.error("[client-documents] supabase list", error);
      return [];
    }
  }

  const store = await readStore();
  return store.documents
    .filter((doc) => doc.clientId === clientId)
    .map(normalizeStored)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function getClientUploadedDocument(
  documentId: string,
  clientId: string,
): Promise<ClientDocument | null> {
  if (isSupabaseConfigured()) {
    try {
      return await sbDocs.sbGetClientDocument(documentId, clientId);
    } catch (error) {
      console.error("[client-documents] supabase get", error);
      return null;
    }
  }

  const store = await readStore();
  const doc = store.documents.find(
    (item) => item.id === documentId && item.clientId === clientId,
  );
  return doc ? normalizeStored(doc) : null;
}

export async function addClientUploadedDocument(
  clientId: string,
  uploadedBy: string,
  file: {
    buffer: Buffer;
    fileName: string;
    contentType: string;
    size: number;
  },
): Promise<ClientDocument> {
  if (file.size > MAX_CLIENT_DOCUMENT_BYTES) {
    throw new Error("Файл слишком большой (макс. 25 МБ)");
  }

  const contentType = normalizeClientDocumentContentType(
    file.contentType,
    file.fileName,
  );
  if (!contentType || !isAllowedClientDocument(file.fileName, file.contentType)) {
    throw new Error("Неподдерживаемый тип файла");
  }

  const existingCount = isSupabaseConfigured()
    ? await sbDocs.sbCountClientDocuments(clientId)
    : (await readStore()).documents.filter((d) => d.clientId === clientId).length;

  if (existingCount >= MAX_CLIENT_DOCUMENTS_PER_CLIENT) {
    throw new Error("Слишком много документов (макс. 20)");
  }

  const doc: ClientDocument = {
    id: `CD-${randomUUID()}`,
    clientId,
    name: file.fileName,
    fileName: file.fileName,
    uploadedAt: new Date().toISOString(),
    category: "Загружено",
    contentType,
    sizeBytes: file.size,
    uploadedBy,
    source: "upload",
  };

  await saveClientDocumentFile(doc.id, file.fileName, file.buffer, contentType);

  try {
    if (isSupabaseConfigured()) {
      return await sbDocs.sbInsertClientDocument(doc);
    }
    const store = await readStore();
    store.documents.push(doc);
    await writeStore(store);
    return doc;
  } catch (error) {
    await deleteClientDocumentFile(doc.id, file.fileName).catch(() => undefined);
    throw error;
  }
}

export async function removeClientUploadedDocument(
  documentId: string,
  clientId: string,
): Promise<ClientDocument | null> {
  let removed: ClientDocument | null = null;

  if (isSupabaseConfigured()) {
    try {
      removed = await sbDocs.sbDeleteClientDocument(documentId, clientId);
    } catch (error) {
      console.error("[client-documents] supabase delete", error);
      return null;
    }
  } else {
    const store = await readStore();
    const index = store.documents.findIndex(
      (item) => item.id === documentId && item.clientId === clientId,
    );
    if (index < 0) return null;
    removed = normalizeStored(store.documents[index]!);
    store.documents.splice(index, 1);
    await writeStore(store);
  }

  if (removed) {
    const fileName = removed.fileName ?? removed.name;
    await deleteClientDocumentFile(removed.id, fileName).catch(() => undefined);
  }

  return removed;
}
