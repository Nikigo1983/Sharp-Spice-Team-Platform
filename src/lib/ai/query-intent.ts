import { routeWorkspaceQueryByRules } from "@/lib/ai/workspace-router-rules";
import {
  isEmigrantDrivePrimaryQuery,
  isPassportNumberLookupQuery,
} from "@/lib/ai/query-intent-signals";
import { shouldUseInternetSearch } from "@/lib/ai/workspace-web-search";

export type WorkspaceQueryIntent = {
  /** Букинг/адрес конкретного клиента — ответ из таблицы без AI */
  fastClientLookup: boolean;
  needsKb: boolean;
  /** Полный текст документов (медленно) */
  needsKbFullText: boolean;
  /** Папка Google Drive «ЭМИГРАНТ» — документы клиентов */
  needsEmigrantDrive: boolean;
  needsEmigrantDriveFullText: boolean;
  /** Запрос явно про папку ЭМИГРАНТ — не обрывать на «клиент не в таблице» */
  emigrantDrivePrimary: boolean;
  needsClients: boolean;
  needsEmigrantDesk: boolean;
  needsFormgrid: boolean;
  /** Внешний web search — только когда явно нужны актуальные внешние факты */
  needsInternet: boolean;
};

export {
  isEmigrantDrivePrimaryQuery,
  isPassportNumberLookupQuery,
};

/**
 * Synchronous workspace intent (AI-03 rules layer).
 * Full hybrid routing: resolveWorkspaceRouting() in workspace-router.ts.
 */
export function detectWorkspaceIntent(query: string): WorkspaceQueryIntent {
  const intent = routeWorkspaceQueryByRules(query).decision.workspaceIntent;
  return {
    ...intent,
    needsInternet: shouldUseInternetSearch(query),
  };
}
