import { routeWorkspaceQueryByRules } from "@/lib/ai/workspace-router-rules";
import {
  isEmigrantDrivePrimaryQuery,
  isPassportNumberLookupQuery,
} from "@/lib/ai/query-intent-signals";

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
  return routeWorkspaceQueryByRules(query).decision.workspaceIntent;
}
