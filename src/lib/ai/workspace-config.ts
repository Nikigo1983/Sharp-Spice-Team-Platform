export type WorkspaceResponseMode =
  | "brief"
  | "detailed"
  | "client-text"
  | "case-analysis";

export type WorkspaceAiConfig = {
  model: string | undefined;
  temperature: number;
  maxTokens: number;
  stream: boolean;
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

export function getWorkspaceAiConfig(): WorkspaceAiConfig {
  return {
    model: process.env.AI_WORKSPACE_MODEL?.trim() || undefined,
    temperature: parseNumber(process.env.AI_WORKSPACE_TEMPERATURE, 0.8),
    maxTokens: parseNumber(process.env.AI_WORKSPACE_MAX_TOKENS, 1000),
    stream: parseBoolean(process.env.AI_WORKSPACE_STREAM, true),
  };
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
