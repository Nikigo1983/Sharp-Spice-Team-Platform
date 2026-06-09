import "server-only";

import {
  SEARCH_COLUMNS_CLIENTS,
  SEARCH_COLUMNS_NEW_CLIENTS,
} from "@/lib/ai/client-search";
import {
  getRecentClientSearches,
  type ClientSearchHistoryEntry,
} from "@/lib/ai/client-search-history";
import {
  formatFormgridRowSummary,
  getFormgridClientName,
} from "@/lib/google-sheets/formgrid-dates";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { listAllClients } from "@/lib/google-sheets/service";

export type ClientTableSample = {
  rowIndex: number;
  name: string;
  details: string;
};

export type ClientsDiagnosticReport = {
  lastSyncedAt: string;
  searchColumns: {
    clients: string[];
    newClients: string[];
  };
  recentSearches: ClientSearchHistoryEntry[];
  clientsTable: {
    label: string;
    count: number;
    source: string;
    spreadsheetEnv: string;
    gidEnv: string;
    samples: ClientTableSample[];
  };
  newClientsTable: {
    label: string;
    count: number;
    source: string;
    spreadsheetEnv: string;
    gidEnv: string;
    samples: ClientTableSample[];
  };
};

export async function getClientsDiagnosticReport(): Promise<ClientsDiagnosticReport> {
  const syncedAt = new Date().toISOString();
  const [{ items, source: clientsSource }, formgrid] = await Promise.all([
    listAllClients(),
    getFormgridLeadsTable(),
  ]);

  return {
    lastSyncedAt: syncedAt,
    searchColumns: {
      clients: [...SEARCH_COLUMNS_CLIENTS],
      newClients: [...SEARCH_COLUMNS_NEW_CLIENTS],
    },
    recentSearches: getRecentClientSearches(),
    clientsTable: {
      label: "Клиенты",
      count: items.length,
      source: clientsSource,
      spreadsheetEnv: "GOOGLE_SHEETS_SPREADSHEET_ID",
      gidEnv: "GOOGLE_SHEETS_PUBLIC_CLIENTS_GID",
      samples: items.slice(0, 3).map((client) => ({
        rowIndex: client.rowIndex ?? 0,
        name: client.name,
        details: [
          client.passportNumber && client.passportNumber !== "—"
            ? `паспорт ${client.passportNumber}`
            : null,
          client.manager && client.manager !== "—"
            ? `менеджер ${client.manager}`
            : null,
          client.status && client.status !== "—"
            ? `статус ${client.status}`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    },
    newClientsTable: {
      label: "Новые клиенты",
      count: formgrid.rows.length,
      source: formgrid.source,
      spreadsheetEnv: "GOOGLE_SHEETS_FORMGRID_SPREADSHEET_ID",
      gidEnv: "GOOGLE_SHEETS_FORMGRID_GID",
      samples: formgrid.rows.slice(0, 3).map((row, index) => ({
        rowIndex: index + 2,
        name: getFormgridClientName(formgrid.headers, row),
        details: formatFormgridRowSummary(formgrid.headers, row),
      })),
    },
  };
}
