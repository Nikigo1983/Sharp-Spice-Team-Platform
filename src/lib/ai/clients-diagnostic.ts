import "server-only";

import {
  SEARCH_COLUMNS_CLIENTS,
} from "@/lib/ai/client-search";
import {
  getRecentClientSearches,
  type ClientSearchHistoryEntry,
} from "@/lib/ai/client-search-history";
import {
  listPortalIntakeCasesForAi,
  portalIntakeDisplayName,
  PORTAL_INTAKE_SOURCE_LABEL,
} from "@/lib/ai/portal-intake-clients";
import { readProcessStatus } from "@/lib/client-portal/process-status";
import { readStaffFields } from "@/lib/client-portal/staff-fields";

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
  const cases = await listPortalIntakeCasesForAi();

  return {
    lastSyncedAt: syncedAt,
    searchColumns: {
      clients: [...SEARCH_COLUMNS_CLIENTS],
      newClients: [],
    },
    recentSearches: getRecentClientSearches(),
    clientsTable: {
      label: PORTAL_INTAKE_SOURCE_LABEL,
      count: cases.length,
      source: "portal_intake",
      spreadsheetEnv: "n/a (Supabase client_portal_questionnaires)",
      gidEnv: "n/a",
      samples: cases.slice(0, 3).map((record, index) => {
        const staff = readStaffFields(record.answers);
        const process = readProcessStatus(record.answers, record.status);
        return {
          rowIndex: index + 1,
          name: portalIntakeDisplayName(record),
          details: [
            process?.value ? `статус ${process.value}` : null,
            staff.curator ? `куратор ${staff.curator}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        };
      }),
    },
    newClientsTable: {
      label: "Formgrid / Новые клиенты (отключено)",
      count: 0,
      source: "disabled",
      spreadsheetEnv: "disabled",
      gidEnv: "disabled",
      samples: [],
    },
  };
}
