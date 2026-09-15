/**
 * Workspace AI canonical data contract (Phase 0).
 * Single source of truth for ontology — do not duplicate across prompts.
 */

/** Bump when Workspace system-prompt assembly semantics change. */
export const WORKSPACE_AI_PROMPT_VERSION = "phase0-canonical-v1";

export const WORKSPACE_CANONICAL_CLIENT_SOURCE = {
  id: "client_portal" as const,
  /** User-facing label (no implementation jargon). */
  labelRu: "Заявки портала Emigrant",
  technology: "supabase_postgres",
  table: "client_portal_questionnaires",
  /** Canonical client primary key. */
  clientId: "questionnaire_uuid",
};

export const WORKSPACE_RELATED_AUTHORITATIVE_SOURCES = {
  finance: {
    id: "finance" as const,
    labelRu: "Finance",
    linkField: "clientExternalId",
    note: "Contract € / paid / debt — not portal process status",
  },
} as const;

export const WORKSPACE_SECONDARY_SOURCES = {
  drive: { id: "emigrant_drive" as const, labelRu: "ЭМИГРАНТ (Google Drive)" },
  knowledgeBase: {
    id: "knowledge_base" as const,
    labelRu: "Knowledge Base",
  },
  desk: {
    id: "emigrant_desk" as const,
    labelRu: "Emigrant Croatia Desk",
  },
} as const;

/**
 * Still used by non-Workspace product surfaces.
 * Must NOT be treated as Workspace AI canonical client DB.
 */
export const WORKSPACE_LEGACY_NON_CANONICAL_SOURCES = {
  googleSheetsClients: "google_sheets_clients",
  formgridLeadsUi: "formgrid_leads_ui",
  legacyClientCardAi: "api_clients_id_ai",
} as const;

/**
 * Compact block for system prompts (ontology only — no field dictionary).
 */
export function workspaceCanonicalSourcePromptBlock(): string {
  return `Источники данных (контракт платформы):
- Канонический источник клиентов: ${WORKSPACE_CANONICAL_CLIENT_SOURCE.labelRu} (серверная БД анкет; id = UUID заявки).
- Связанный авторитетный источник денег: ${WORKSPACE_RELATED_AUTHORITATIVE_SOURCES.finance.labelRu} (суммы договора / оплачено / долг; не путать со статусом заявки).
- Вторичные: ${WORKSPACE_SECONDARY_SOURCES.drive.labelRu}, ${WORKSPACE_SECONDARY_SOURCES.knowledgeBase.labelRu}, ${WORKSPACE_SECONDARY_SOURCES.desk.labelRu}.
- Google Sheets «Клиенты» и отдельный Formgrid UI — не канонический клиентский источник AI Workspace (не опирайся на них для фактов о клиентах).`;
}
