import { getWorkspaceFinalModel } from "@/lib/ai/models";
import type { SessionUser, UserRole } from "@/lib/auth/types";

export type WorkspaceResponseMode =
  | "brief"
  | "detailed"
  | "client-text"
  | "case-analysis";

/**
 * Agent tools rollout modes.
 * - off: legacy path only (default)
 * - internal: eligible staff only; executes tools
 * - shadow: PARSED but intentionally NON-EXECUTING (treated as off).
 *   Prior semantics executed real tools then fell back — unsafe for observational use.
 * - on: all authenticated users (supported in code; not for Phase-1 rollout)
 */
export type WorkspaceAgentToolsMode = "off" | "internal" | "shadow" | "on";

export type WorkspaceAgentActor = {
  id?: string;
  userId?: string;
  email: string;
  role: UserRole;
};

export type WorkspaceAiConfig = {
  /** Always resolved — defaults to GPT-6 Astra when env unset. */
  model: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  /**
   * Phase 1 Astra tool-calling. Production default MUST remain `off`.
   * Only `internal` (staff-gated) or `on` may execute tools.
   * `shadow` is accepted but does not execute (see isWorkspaceAgentToolsEnabled).
   */
  agentToolsMode: WorkspaceAgentToolsMode;
};

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

export function parseWorkspaceAgentToolsMode(
  value: string | undefined,
): WorkspaceAgentToolsMode {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (
    normalized === "off" ||
    normalized === "internal" ||
    normalized === "shadow" ||
    normalized === "on"
  ) {
    return normalized;
  }
  // Treat legacy true/1 as "internal" (staff-gated), never as broad "on".
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return "internal";
  }
  return "off";
}

export function getWorkspaceAiConfig(): WorkspaceAiConfig {
  return {
    model: getWorkspaceFinalModel(),
    temperature: parseNumber(process.env.AI_WORKSPACE_TEMPERATURE, 0.4),
    maxTokens: parseNumber(process.env.AI_WORKSPACE_MAX_TOKENS, 1500),
    stream: parseBoolean(process.env.AI_WORKSPACE_STREAM, true),
    agentToolsMode: parseWorkspaceAgentToolsMode(
      process.env.AI_WORKSPACE_AGENT_TOOLS,
    ),
  };
}

/**
 * True when tools may run (still subject to staff eligibility for `internal`).
 * `shadow` is intentionally excluded — it must not execute tools or cause side effects.
 */
export function isWorkspaceAgentToolsEnabled(
  mode: WorkspaceAgentToolsMode = getWorkspaceAiConfig().agentToolsMode,
): boolean {
  return mode === "internal" || mode === "on";
}

export function isWorkspaceAgentToolsPrimary(
  mode: WorkspaceAgentToolsMode = getWorkspaceAiConfig().agentToolsMode,
): boolean {
  return mode === "internal" || mode === "on";
}

/**
 * Staff allowlist for `internal` mode.
 * - Roles: AI_WORKSPACE_AGENT_INTERNAL_ROLES (default: owner)
 * - Optional emails: AI_WORKSPACE_AGENT_INTERNAL_EMAILS (comma-separated)
 */
export function isWorkspaceAgentInternalEligible(
  actor: WorkspaceAgentActor | SessionUser | null | undefined,
): boolean {
  if (!actor?.email || !actor.role) return false;

  const rolesRaw =
    process.env.AI_WORKSPACE_AGENT_INTERNAL_ROLES?.trim() || "owner";
  const roles = new Set(
    rolesRaw
      .split(",")
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean),
  );
  if (roles.has(actor.role.toLowerCase())) return true;

  const emailsRaw = process.env.AI_WORKSPACE_AGENT_INTERNAL_EMAILS?.trim() || "";
  if (!emailsRaw) return false;
  const emails = new Set(
    emailsRaw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  return emails.has(actor.email.trim().toLowerCase());
}

/**
 * End-to-end gate: flag mode + actor eligibility.
 * When disabled, callers must not expose tools or enter the agent loop.
 */
export function shouldEnterWorkspaceAgentPath(params: {
  mode?: WorkspaceAgentToolsMode;
  actor?: WorkspaceAgentActor | SessionUser | null;
  forceLegacy?: boolean;
}): boolean {
  if (params.forceLegacy) return false;
  const mode = params.mode ?? getWorkspaceAiConfig().agentToolsMode;
  // shadow / off / unknown → no execution
  if (!isWorkspaceAgentToolsEnabled(mode)) return false;
  if (mode === "on") {
    const id =
      (params.actor && "id" in params.actor && params.actor.id) ||
      (params.actor && "userId" in params.actor && params.actor.userId);
    return Boolean(id);
  }
  // internal only
  return isWorkspaceAgentInternalEligible(params.actor);
}

export function isWorkspaceResponseMode(
  value: string,
): value is WorkspaceResponseMode {
  return (
    value === "brief" ||
    value === "detailed" ||
    value === "client-text" ||
    value === "case-analysis"
  );
}
