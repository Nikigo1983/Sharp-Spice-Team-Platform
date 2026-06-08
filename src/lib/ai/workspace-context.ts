import {
  formatClientForAi,
  formatClientOneLiner,
} from "@/lib/ai/format-client";
import type { WorkspaceQueryIntent } from "@/lib/ai/query-intent";
import { getKnowledgeBaseTextForAi } from "@/lib/google-drive/kb-text";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { listClients } from "@/lib/google-sheets/service";
import type { Client } from "@/lib/google-sheets/types";

const MAX_CLIENTS = 300;
const MAX_FORMGRID_ROWS = 80;

function tokenizeQuery(query: string): string[] {
  const lower = query.toLowerCase();
  const afterClient = lower.match(
    /(?:клиент[а-я]*|у)\s+([а-яё\-]+(?:\s+[а-яё\-]+)?)/iu,
  );
  const focus = afterClient?.[1] ?? lower;

  return focus
    .split(/[^\p{L}\p{N}@.]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function clientLine(client: Client, detailed = false): string {
  if (detailed) {
    return `---\n${formatClientForAi(client)}\n---`;
  }
  return formatClientOneLiner(client);
}

function scoreClient(client: Client, tokens: string[]): number {
  const hay = clientLine(client).toLowerCase();
  const nameHay = client.name.toLowerCase();
  return tokens.reduce((s, t) => {
    if (nameHay.includes(t)) return s + 10;
    if (hay.includes(t)) return s + 2;
    return s;
  }, 0);
}

export async function buildClientsContextForAi(
  userQuery: string,
): Promise<{ text: string; count: number }> {
  const { items, total, source } = await listClients(1, MAX_CLIENTS);
  const tokens = tokenizeQuery(userQuery);

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

  const tokens = tokenizeQuery(userQuery);
  const recent = rows.slice(-MAX_FORMGRID_ROWS);

  const scored = recent.map((row, index) => {
    const hay = row.join(" ").toLowerCase();
    const score = tokens.reduce(
      (s, t) => (hay.includes(t) ? s + 2 : s),
      0,
    );
    return { row, index, score };
  });

  const selected =
    tokens.length === 0
      ? scored.slice(-12)
      : scored.some((r) => r.score > 0)
        ? scored.filter((r) => r.score > 0)
        : scored.slice(-15);

  const headerLine = headers.join("\t");
  const body = selected.map(({ row }) => row.join("\t")).join("\n");

  return {
    text: `Новые клиенты из анкеты Formgrid (источник: ${source}): строк ${rows.length}, в контексте ${selected.length}.\nЗаголовки: ${headerLine}\n${body}`,
    rowCount: rows.length,
  };
}

export type WorkspaceContextBundle = {
  clientsText: string;
  formgridText: string;
  knowledgeBaseText: string;
  meta: {
    clientsTotal: number;
    formgridRows: number;
  };
};

export async function buildWorkspaceContext(
  userMessage: string,
  intent: WorkspaceQueryIntent,
): Promise<WorkspaceContextBundle> {
  const [clients, formgrid, knowledgeBaseText] = await Promise.all([
    intent.needsClients
      ? buildClientsContextForAi(userMessage)
      : Promise.resolve({ text: "Клиенты: не запрашивались.", count: 0 }),
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
    formgridText: formgrid.text,
    knowledgeBaseText,
    meta: {
      clientsTotal: clients.count,
      formgridRows: formgrid.rowCount,
    },
  };
}
