import type { WorkspaceQueryIntent } from "@/lib/ai/query-intent";
import {
  listPortalIntakeCasesForAi,
  portalCaseLine,
  portalIntakeDisplayName,
  PORTAL_INTAKE_SOURCE_LABEL,
} from "@/lib/ai/portal-intake-clients";
import {
  skippedDriveMeta,
  type DriveRetrievalMeta,
} from "@/lib/ai/workspace-trace";
import { buildEmigrantDeskContextForAi } from "@/lib/emigrant-desk/clients";
import {
  getEmigrantDriveTextForAi,
  getKnowledgeBaseTextForAi,
} from "@/lib/google-drive/kb-text";
import { isGoogleDriveEmigrantConfigured } from "@/lib/google-sheets/auth";
import { tokenizeSearchQuery } from "@/lib/ai/name-matching";

function scorePortalCase(
  displayName: string,
  line: string,
  tokens: string[],
): number {
  if (tokens.length === 0) return 0;
  const hay = `${displayName} ${line}`.toLowerCase();
  return tokens.reduce((score, token) => {
    if (token.length >= 3 && hay.includes(token)) return score + 2;
    return score;
  }, 0);
}

/** Context from Заявки клиентского портала Emigrant (replaces Sheets + Formgrid). */
export async function buildPortalIntakeContextForAi(
  userQuery: string,
): Promise<{ text: string; count: number }> {
  const cases = await listPortalIntakeCasesForAi();
  const total = cases.length;
  const tokens = tokenizeSearchQuery(userQuery);

  const ranked = [...cases]
    .map((record) => {
      const name = portalIntakeDisplayName(record);
      const line = portalCaseLine(record, true);
      return {
        record,
        name,
        line,
        score: scorePortalCase(name, line, tokens),
      };
    })
    .sort((a, b) => b.score - a.score);

  const selected =
    tokens.length === 0
      ? ranked.slice(0, 12)
      : ranked.some((c) => c.score > 0)
        ? ranked.filter((c) => c.score > 0).slice(0, 8)
        : ranked.slice(0, 10);

  const detailed =
    selected.length <= 3 ||
    tokens.some((t) =>
      ["букинг", "адрес", "паспорт", "статус", "адвокат"].some(
        (k) => t.includes(k) || k.includes(t),
      ),
    );

  const lines = selected.map((c) =>
    portalCaseLine(c.record, detailed || selected.length <= 3),
  );
  const header = `${PORTAL_INTAKE_SOURCE_LABEL}: всего ${total}, в контексте ${lines.length}.`;

  return {
    text: `${header}\n${lines.join("\n")}`,
    count: total,
  };
}

/** @deprecated Use buildPortalIntakeContextForAi — Sheets CRM disconnected. */
export async function buildClientsContextForAi(
  userQuery: string,
): Promise<{ text: string; count: number }> {
  return buildPortalIntakeContextForAi(userQuery);
}

/** @deprecated Formgrid disconnected from AI Workspace — portal intake only. */
export async function buildFormgridContextForAi(
  _userQuery: string,
): Promise<{ text: string; rowCount: number }> {
  return {
    text: "Новые клиенты / Formgrid отключены как канонический источник AI Workspace. Используйте заявки клиентского портала Emigrant.",
    rowCount: 0,
  };
}

export type WorkspaceContextBundle = {
  clientsText: string;
  emigrantDeskText: string;
  emigrantDriveText: string;
  formgridText: string;
  knowledgeBaseText: string;
  kbRetrieval: DriveRetrievalMeta;
  emigrantDriveRetrieval: DriveRetrievalMeta;
  meta: {
    clientsTotal: number;
    emigrantDeskTotal: number;
    emigrantDriveConfigured: boolean;
    formgridRows: number;
  };
};

export async function buildWorkspaceContext(
  userMessage: string,
  intent: WorkspaceQueryIntent,
): Promise<WorkspaceContextBundle> {
  const needsPortalClients = intent.needsClients || intent.needsFormgrid;

  const [clients, emigrantDesk, emigrantDrive, knowledgeBase] =
    await Promise.all([
      needsPortalClients
        ? buildPortalIntakeContextForAi(userMessage)
        : Promise.resolve({
            text: "Заявки портала: не запрашивались.",
            count: 0,
          }),
      intent.needsEmigrantDesk
        ? buildEmigrantDeskContextForAi(userMessage)
        : Promise.resolve({
            text: "Emigrant Croatia Desk: не запрашивался.",
            count: 0,
          }),
      intent.needsEmigrantDrive
        ? getEmigrantDriveTextForAi(userMessage, {
            full: intent.needsEmigrantDriveFullText,
          })
        : Promise.resolve({
            text: "Папка ЭМИГРАНТ (Google Drive): для этого вопроса не подключалась.",
            meta: skippedDriveMeta("emigrant_drive"),
          }),
      intent.needsKb
        ? getKnowledgeBaseTextForAi(userMessage, {
            full: intent.needsKbFullText,
          })
        : Promise.resolve({
            text: "Knowledge Base: для этого вопроса не подключалась (ускорение ответа).",
            meta: skippedDriveMeta("knowledge_base"),
          }),
    ]);

  return {
    clientsText: clients.text,
    emigrantDeskText: emigrantDesk.text,
    emigrantDriveText: emigrantDrive.text,
    formgridText: intent.needsFormgrid
      ? "Отдельный Formgrid / Новые лиды отключён как источник AI Workspace. Недавние заявки — из заявок портала Emigrant (блок CLIENT CONTEXT / recent portal)."
      : "Недавние заявки портала: не запрашивались.",
    knowledgeBaseText: knowledgeBase.text,
    kbRetrieval: knowledgeBase.meta,
    emigrantDriveRetrieval: emigrantDrive.meta,
    meta: {
      clientsTotal: clients.count,
      emigrantDeskTotal: emigrantDesk.count,
      emigrantDriveConfigured:
        intent.needsEmigrantDrive && isGoogleDriveEmigrantConfigured(),
      formgridRows: 0,
    },
  };
}
