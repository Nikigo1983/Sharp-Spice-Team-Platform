/**
 * Allowlisted tool registry — only these tools may execute.
 */

import {
  executeGetCaseContext,
  executeGetClient,
  executeSearchClients,
} from "@/lib/ai/workspace-tools/client-tools";
import { executeSearchKnowledgeBase } from "@/lib/ai/workspace-tools/kb-tools";
import {
  GET_CASE_CONTEXT_PARAMETERS,
  GET_CLIENT_PARAMETERS,
  SEARCH_CLIENTS_PARAMETERS,
  SEARCH_KNOWLEDGE_BASE_PARAMETERS,
} from "@/lib/ai/workspace-tools/schemas";
import type {
  WorkspaceToolDefinition,
  WorkspaceToolName,
} from "@/lib/ai/workspace-tools/types";
import type { ChatToolDefinition } from "@/lib/ai/openai";

export const WORKSPACE_TOOL_REGISTRY: Record<
  WorkspaceToolName,
  WorkspaceToolDefinition
> = {
  search_clients: {
    name: "search_clients",
    description:
      "Search CRM clients by name (RU morphology), email, or passport. Returns safe match summaries. If multiple credible matches, ambiguous=true — ask the user; do not pick silently.",
    parameters: SEARCH_CLIENTS_PARAMETERS as unknown as Record<string, unknown>,
    uiStatusLabel: "Ищу клиента…",
    execute: executeSearchClients,
  },
  get_client: {
    name: "get_client",
    description:
      "Load a safe canonical CRM client record by clientId from search_clients. Never returns passwords or secrets.",
    parameters: GET_CLIENT_PARAMETERS as unknown as Record<string, unknown>,
    uiStatusLabel: "Получаю данные клиента…",
    execute: executeGetClient,
  },
  get_case_context: {
    name: "get_case_context",
    description:
      "Bounded case summary for a clientId: safe CRM fields, dates, notes preview, Sheets document inventory metadata only. Does not dump Drive/KB bodies.",
    parameters: GET_CASE_CONTEXT_PARAMETERS as unknown as Record<
      string,
      unknown
    >,
    uiStatusLabel: "Проверяю дело клиента…",
    execute: executeGetCaseContext,
  },
  search_knowledge_base: {
    name: "search_knowledge_base",
    description:
      "Lexical search over the corporate Knowledge Base. Returns ranked short untrusted snippets only — not full documents.",
    parameters: SEARCH_KNOWLEDGE_BASE_PARAMETERS as unknown as Record<
      string,
      unknown
    >,
    uiStatusLabel: "Ищу информацию в базе знаний…",
    execute: executeSearchKnowledgeBase,
  },
};

export function isRegisteredWorkspaceTool(
  name: string,
): name is WorkspaceToolName {
  return Object.prototype.hasOwnProperty.call(WORKSPACE_TOOL_REGISTRY, name);
}

export function getWorkspaceToolDefinition(
  name: string,
): WorkspaceToolDefinition | null {
  if (!isRegisteredWorkspaceTool(name)) return null;
  return WORKSPACE_TOOL_REGISTRY[name];
}

export function listWorkspaceToolDefinitions(): WorkspaceToolDefinition[] {
  return Object.values(WORKSPACE_TOOL_REGISTRY);
}

/** OpenRouter/OpenAI tools payload. */
export function buildOpenRouterToolDefinitions(): ChatToolDefinition[] {
  return listWorkspaceToolDefinitions().map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function toolUiStatusLabel(name: string): string {
  const def = getWorkspaceToolDefinition(name);
  return def?.uiStatusLabel ?? "Обрабатываю запрос…";
}
