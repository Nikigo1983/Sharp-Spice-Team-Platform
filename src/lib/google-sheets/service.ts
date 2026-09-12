import { getAiMirrorSource, getAiMirrorContext } from "@/lib/ai-data/reader";
import { formatClientForAi } from "@/lib/ai/format-client";
import {
  DEMO_CLIENTS,
  appendDemoNote,
  getDemoClientDetail,
} from "./demo-data";
import { getGoogleSheetsClient, sheetsConfigured } from "./google-sheets-client";
import { isGoogleSheetsPublicClientsConfigured } from "./auth";
import { listClientUploadedDocuments } from "@/lib/clients/local-documents";
import {
  appendLocalNote,
  listLocalNotesByClientId,
  updateLocalNote,
} from "./local-notes";
import {
  clientMatchesFilters,
  clientMatchesSearch,
} from "./parse";
import type {
  Client,
  ClientDetail,
  ClientFilters,
  ClientsListResult,
} from "./types";

const DEFAULT_PAGE_SIZE = 25;

export async function listAllClients(filters: ClientFilters = {}): Promise<{
  items: Client[];
  source: ClientsListResult["source"];
}> {
  let all: Client[];
  let source: ClientsListResult["source"];

  const mirror = await getAiMirrorSource("clients");
  if (mirror) {
    all = mirror.payload.clients;
    source = "supabase";
  } else if (sheetsConfigured()) {
    all = await getGoogleSheetsClient().getClients();
    source = "google_sheets";
  } else {
    all = DEMO_CLIENTS;
    source = "demo";
  }

  const items = all.filter(
    (client) =>
      clientMatchesSearch(client, filters.search ?? "") &&
      clientMatchesFilters(client, filters),
  );

  return { items, source };
}

export async function listClients(
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  filters: ClientFilters = {},
): Promise<ClientsListResult> {
  const { items: filtered, source } = await listAllClients(filters);

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total, page, pageSize, source };
}

function markSheetDocuments(
  documents: ClientDetail["documents"],
): ClientDetail["documents"] {
  return documents.map((doc) =>
    doc.source ? doc : { ...doc, source: "sheet" as const },
  );
}

async function mergeUploadedDocuments(
  clientId: string,
  sheetDocuments: ClientDetail["documents"],
): Promise<ClientDetail["documents"]> {
  const uploaded = await listClientUploadedDocuments(clientId);
  return [...uploaded, ...markSheetDocuments(sheetDocuments)];
}

export async function getClientDetail(id: string): Promise<ClientDetail | null> {
  const mirror = await getAiMirrorSource("clients");
  if (mirror) {
    const client = mirror.payload.clients.find(c => c.id === id);
    if (!client) return null;
    const context = await getAiMirrorContext();
    const notes = [...mirror.payload.notes, ...context.notes].filter(
      (r) => r.clientId === id,
    );
    const documents = await mergeUploadedDocuments(
      id,
      mirror.payload.documents.filter((r) => r.clientId === id),
    );
    return {
      client,
      source: "supabase",
      surveys: mirror.payload.surveys.filter((r) => r.clientId === id),
      documents,
      notes,
    };
  }
  if (sheetsConfigured()) {
    const sheets = getGoogleSheetsClient();
    const client = await sheets.getClientById(id);
    if (!client) return null;

    if (isGoogleSheetsPublicClientsConfigured()) {
      const [notes, documents] = await Promise.all([
        listLocalNotesByClientId(id),
        mergeUploadedDocuments(id, []),
      ]);
      return {
        client,
        surveys: [],
        documents,
        notes,
        source: "google_sheets",
      };
    }

    const [surveys, sheetDocuments, notes] = await Promise.all([
      sheets.getSurveysByClientId(id),
      sheets.getDocumentsByClientId(id),
      sheets.getNotesByClientId(id),
    ]);
    const documents = await mergeUploadedDocuments(id, sheetDocuments);

    return { client, surveys, documents, notes, source: "google_sheets" };
  }

  const demo = getDemoClientDetail(id);
  if (!demo) return null;
  return {
    ...demo,
    documents: await mergeUploadedDocuments(id, demo.documents),
  };
}

export async function getFilterOptions(): Promise<{
  managers: string[];
  countries: string[];
  referents: string[];
  partners: string[];
  contracts: string[];
  source: ClientsListResult["source"];
}> {
  const all = sheetsConfigured()
    ? await getGoogleSheetsClient().getClients()
    : DEMO_CLIENTS;

  const managers = [...new Set(all.map((c) => c.manager).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "ru"),
  );
  const countries = [
    ...new Set(all.map((c) => c.country).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  const referents = [
    ...new Set(
      all
        .map((c) => (c.referentName || c.manager || "").trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  const partners = [
    ...new Set(
      all.map((c) => (c.partnerName ?? "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  const contracts = [
    ...new Set(all.map((c) => (c.contract ?? "").trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "ru"));

  return {
    managers,
    countries,
    referents,
    partners,
    contracts,
    source: sheetsConfigured() ? "google_sheets" : "demo",
  };
}

export async function addClientNote(
  clientId: string,
  author: string,
  text: string,
): Promise<boolean> {
  if (sheetsConfigured()) {
    if (isGoogleSheetsPublicClientsConfigured()) {
      return appendLocalNote(clientId, author, text);
    }
    return getGoogleSheetsClient().appendNote(clientId, author, text);
  }

  appendDemoNote(clientId, author, text);
  return true;
}

export async function updateClientNote(
  noteId: string,
  clientId: string,
  text: string,
  rowIndex?: number,
): Promise<boolean> {
  if (sheetsConfigured()) {
    if (isGoogleSheetsPublicClientsConfigured()) {
      return updateLocalNote(noteId, clientId, text);
    }
    if (rowIndex) {
      return getGoogleSheetsClient().updateNote(rowIndex, text);
    }
    return false;
  }

  void noteId;
  void clientId;
  return true;
}

export function buildClientAiContext(detail: ClientDetail): string {
  const { client, surveys, documents, notes } = detail;

  const surveysText =
    surveys.length > 0
      ? surveys
          .map(
            (s) =>
              `- ${s.title} (${s.filledAt}), статус: ${s.processingStatus}`,
          )
          .join("\n")
      : "Сведения об анкетах в полученном контексте отсутствуют";

  const docsText =
    documents.length > 0
      ? documents
          .map((d) => `- ${d.name} [${d.category}], ${d.uploadedAt}`)
          .join("\n")
      : "Сведения о документах в полученном контексте отсутствуют; это не подтверждает отсутствие документов у клиента";

  const notesText =
    notes.length > 0
      ? notes.map((n) => `${n.createdAt} (${n.author}): ${n.text}`).join("\n")
      : "Нет заметок";

  return `
${formatClientForAi(client)}
ID в системе: ${client.id}
Телефон: ${client.phone}
Email: ${client.email}

Анкеты:
${surveysText}

Документы:
${docsText}

Заметки менеджеров:
${notesText}
`.trim();
}
