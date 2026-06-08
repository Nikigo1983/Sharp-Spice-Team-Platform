import { formatClientForAi } from "@/lib/ai/format-client";
import {
  DEMO_CLIENTS,
  appendDemoNote,
  getDemoClientDetail,
} from "./demo-data";
import { getGoogleSheetsClient, sheetsConfigured } from "./google-sheets-client";
import { isGoogleSheetsPublicClientsConfigured } from "./auth";
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

  if (sheetsConfigured()) {
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

export async function getClientDetail(id: string): Promise<ClientDetail | null> {
  if (sheetsConfigured()) {
    const sheets = getGoogleSheetsClient();
    const client = await sheets.getClientById(id);
    if (!client) return null;

    if (isGoogleSheetsPublicClientsConfigured()) {
      const notes = await listLocalNotesByClientId(id);
      return {
        client,
        surveys: [],
        documents: [],
        notes,
        source: "google_sheets",
      };
    }

    const [surveys, documents, notes] = await Promise.all([
      sheets.getSurveysByClientId(id),
      sheets.getDocumentsByClientId(id),
      sheets.getNotesByClientId(id),
    ]);

    return { client, surveys, documents, notes, source: "google_sheets" };
  }

  return getDemoClientDetail(id);
}

export async function getFilterOptions(): Promise<{
  managers: string[];
  countries: string[];
  source: ClientsListResult["source"];
}> {
  const all = sheetsConfigured()
    ? await getGoogleSheetsClient().getClients()
    : DEMO_CLIENTS;

  const managers = [...new Set(all.map((c) => c.manager).filter(Boolean))].sort();
  const countries = [...new Set(all.map((c) => c.country).filter(Boolean))].sort();

  return {
    managers,
    countries,
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
      : "Нет анкет";

  const docsText =
    documents.length > 0
      ? documents
          .map((d) => `- ${d.name} [${d.category}], ${d.uploadedAt}`)
          .join("\n")
      : "Нет документов";

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
