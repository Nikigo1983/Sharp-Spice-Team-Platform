import type { WorkspaceQueryIntent } from "@/lib/ai/query-intent";
import type { AiFallbackReason } from "@/lib/ai/workspace-trace";

export const WORKSPACE_ROUTE_SOURCES = [
  "knowledge_base",
  "clients",
  "emigrant_drive",
  "emigrant_desk",
  "formgrid",
] as const;

export type WorkspaceRouteSource = (typeof WORKSPACE_ROUTE_SOURCES)[number];

export type WorkspaceRouteIntentLabel =
  | "knowledge"
  | "client_lookup"
  | "client_documents"
  | "client_list"
  | "desk_status"
  | "formgrid"
  | "generation"
  | "multi"
  | "direct"
  | "unknown";

export type RoutingMethod = "DIRECT" | "RULE" | "AI" | "FALLBACK";

export type WorkspaceRouterDecision = {
  intentLabel: WorkspaceRouteIntentLabel;
  sources: WorkspaceRouteSource[];
  requiresAuthoritativeData: boolean;
  confidence: number;
  reason: string;
  method: RoutingMethod;
  workspaceIntent: WorkspaceQueryIntent;
  routerModelRequested: string | null;
  fallbackUsed: boolean;
  fallbackReason: AiFallbackReason;
};

export type AiRouterClassification = {
  intent: WorkspaceRouteIntentLabel;
  sources: WorkspaceRouteSource[];
  requires_authoritative_data: boolean;
  confidence: number;
  reason: string;
};

export const ROUTER_CONFIDENCE_HIGH = 0.75;
export const ROUTER_CONFIDENCE_LOW = 0.45;

export function isWorkspaceRouteSource(
  value: string,
): value is WorkspaceRouteSource {
  return (WORKSPACE_ROUTE_SOURCES as readonly string[]).includes(value);
}
