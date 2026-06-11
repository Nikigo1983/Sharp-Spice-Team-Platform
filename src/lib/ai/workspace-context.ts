import {
  formatClientForAi,
  formatClientOneLiner,
} from "@/lib/ai/format-client";
import {
  scorePersonName,
  tokenizeSearchQuery,
} from "@/lib/ai/name-matching";
import type { WorkspaceQueryIntent } from "@/lib/ai/query-intent";
import { buildEmigrantDeskContextForAi } from "@/lib/emigrant-desk/clients";
import {
  getEmigrantDriveTextForAi,
  getKnowledgeBaseTextForAi,
} from "@/lib/google-drive/kb-text";
import { isGoogleDriveEmigrantConfigured } from "@/lib/google-sheets/auth";
import {
  formatFormgridRowSummary,
  sortFormgridRowsByDate,
} from "@/lib/google-sheets/formgrid-dates";
import {
  formatFormgridRowDetailed,
  scoreFormgridRow,
} from "@/lib/google-sheets/formgrid-lookup";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { listClients } from "@/lib/google-sheets/service";
import type { Client } from "@/lib/google-sheets/types";

const MAX_CLIENTS = 300;
const MAX_FORMGRID_ROWS = 80;

function clientLine(client: Client, detailed = false): string {
  if (detailed) {
    return `---\n${formatClientForAi(client)}\n---`;
  }
  return formatClientOneLiner(client);
}

function scoreClient(client: Client, tokens: string[]): number {
  const nameParts = client.name.trim().split(/\s+/);
  const nameScore = scorePersonName(
    nameParts[0],
    nameParts.slice(1).join(" ") || null,
    tokens,
  );
  if (nameScore > 0) return nameScore;

  const hay = clientLine(client).toLowerCase();
  return tokens.reduce((score, token) => {
    if (token.length >= 4 && hay.includes(token)) return score + 2;
    return score;
  }, 0);
}

export async function buildClientsContextForAi(
  userQuery: string,
): Promise<{ text: string; count: number }> {
  const { items, total, source } = await listClients(1, MAX_CLIENTS);
  const tokens = tokenizeSearchQuery(userQuery);

  const ranked = [...items].sort(
    (a, b) => scoreClient(b, tokens) - scoreClient(a, tokens),
  );

  const selected =
    tokens.length === 0
      ? ranked.slice(0, 12)
      : ranked.some((c) => scoreClient(c, tokens) > 0)
        ? ranked.filter((c) => scoreClient(c, tokens) > 0).slice(0, 6)
        : ranked.slice(0, 10);

  const detailed =
    selected.length <= 3 ||
    tokens.some((t) =>
      ["букинг", "адрес", "паспорт"].some((k) => t.includes(k) || k.includes(t)),
    );
  const lines = selected.map((c) => clientLine(c, detailed || selected.length <= 3));
  const header = `Клиенты (таблица «Клиенты Хорватия», источник: ${source}): всего ${total}, в контексте ${lines.length}.`;

  return {
    text: `${header}\n${lines.join("\n")}`,
    count: total,
  };
}

export async function buildFormgridContextForAi(
  userQuery: string,
): Promise<{ text: string; rowCount: number }> {
  const table = await getFormgridLeadsTable();
  const { headers, rows, source } = table;

  if (rows.length === 0) {
    return {
      text: "Новые клиенты из анкеты (Formgrid): данных нет или нет доступа к таблице.",
      rowCount: 0,
    };
  }

  const tokens = tokenizeSearchQuery(userQuery);
  const sorted = sortFormgridRowsByDate(headers, rows);
  const recent = sorted.slice(0, MAX_FORMGRID_ROWS);

  const scored = recent.map((row, index) => ({
    row,
    index,
    score: scoreFormgridRow(headers, row, tokens),
  }));

  const selected =
    tokens.length === 0
      ? scored.slice(0, 15)
      : scored.some((r) => r.score > 0)
        ? scored.filter((r) => r.score > 0).slice(0, 8)
        : scored.slice(0, 12);

  const detailed =
    tokens.length > 0 ||
    selected.length <= 3 ||
    /паспорт|email|телефон|почт/i.test(userQuery);

  const body = selected
    .map(({ row }) =>
      detailed
        ? formatFormgridRowDetailed(headers, row)
        : formatFormgridRowSummary(headers, row),
    )
    .join("\n");

  return {
    text: `Новые клиенты из анкеты Formgrid (источник: ${source}): всего ${rows.length}, в контексте ${selected.length}. Сортировка: сначала самые свежие по дате подачи (Submitted At).\n${body}`,
    rowCount: rows.length,
  };
}

export type WorkspaceContextBundle = {
  clientsText: string;
  emigrantDeskText: string;
  emigrantDriveText: string;
  formgridText: string;
  knowledgeBaseText: string;
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
  const [clients, emigrantDesk, emigrantDriveText, formgrid, knowledgeBaseText] =
    await Promise.all([
    intent.needsClients
      ? buildClientsContextForAi(userMessage)
      : Promise.resolve({ text: "Клиенты: не запрашивались.", count: 0 }),
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
      : Promise.resolve(
          "Папка ЭМИГРАНТ (Google Drive): для этого вопроса не подключалась.",
        ),
    intent.needsFormgrid
      ? buildFormgridContextForAi(userMessage)
      : Promise.resolve({
          text: "Formgrid: не запрашивался.",
          rowCount: 0,
        }),
    intent.needsKb
      ? getKnowledgeBaseTextForAi(userMessage, {
          full: intent.needsKbFullText,
        })
      : Promise.resolve(
          "Knowledge Base: для этого вопроса не подключалась (ускорение ответа).",
        ),
  ]);

  return {
    clientsText: clients.text,
    emigrantDeskText: emigrantDesk.text,
    emigrantDriveText,
    formgridText: formgrid.text,
    knowledgeBaseText,
    meta: {
      clientsTotal: clients.count,
      emigrantDeskTotal: emigrantDesk.count,
      emigrantDriveConfigured:
        intent.needsEmigrantDrive && isGoogleDriveEmigrantConfigured(),
      formgridRows: formgrid.rowCount,
    },
  };
}
