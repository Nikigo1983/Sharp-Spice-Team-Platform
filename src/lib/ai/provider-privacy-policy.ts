/**
 * Centralized external-AI privacy policy (Security Gate 1).
 * OpenRouter request fields verified against OpenRouter provider routing docs:
 *   provider.zdr: boolean
 *   provider.data_collection: "allow" | "deny"
 *   provider.allow_fallbacks: boolean
 *   provider.only?: string[]  (optional allowlist)
 * Do not invent undeclared API fields.
 */

import type { AiProvider } from "@/lib/ai/config";

export type ClientPiiPrivacyMode = "required" | "off";

export type ProviderPrivacyConfigState = "MISSING" | "SAFE" | "UNSAFE" | "UNKNOWN";

export type OpenRouterProviderPreferences = {
  zdr?: boolean;
  data_collection?: "allow" | "deny";
  allow_fallbacks?: boolean;
  only?: string[];
};

export type ProviderPrivacyDecision =
  | {
      ok: true;
      containsClientData: boolean;
      policyRequired: boolean;
      privacyPolicySatisfied: true;
      providerPolicyClass: "openrouter_zdr_deny_collection" | "none";
      openRouterProvider?: OpenRouterProviderPreferences;
      configState: ProviderPrivacyConfigState;
    }
  | {
      ok: false;
      containsClientData: boolean;
      policyRequired: boolean;
      privacyPolicySatisfied: false;
      providerPolicyClass: "unavailable";
      configState: ProviderPrivacyConfigState;
      errorCode: "AI_PRIVACY_POLICY_UNAVAILABLE";
      reason: string;
    };

/**
 * Env semantics (non-secret):
 * - AI_WORKSPACE_CLIENT_PII_PRIVACY=required|off
 *   Default for client-PII requests when unset: required (fail closed).
 * - AI_WORKSPACE_APPROVED_PROVIDERS=comma list of OpenRouter provider slugs
 *   (optional only[] allowlist). Empty = no only[] restriction beyond zdr/deny.
 */
export function getClientPiiPrivacyMode(
  env: NodeJS.ProcessEnv = process.env,
): ClientPiiPrivacyMode {
  const raw = env.AI_WORKSPACE_CLIENT_PII_PRIVACY?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return "off";
  // missing / required / true / anything else → required (fail closed)
  return "required";
}

export function getApprovedOpenRouterProviders(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = env.AI_WORKSPACE_APPROVED_PROVIDERS?.trim() ?? "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function buildOpenRouterClientPiiProviderPreferences(
  env: NodeJS.ProcessEnv = process.env,
): OpenRouterProviderPreferences {
  const only = getApprovedOpenRouterProviders(env);
  const prefs: OpenRouterProviderPreferences = {
    zdr: true,
    data_collection: "deny",
    // Critical: no silent backup to a non-compliant endpoint.
    allow_fallbacks: false,
  };
  if (only.length > 0) prefs.only = only;
  return prefs;
}

/**
 * Resolve whether an external model call may proceed with the given payload class.
 * Client-PII requests never downgrade to an unrestricted provider.
 */
export function resolveProviderPrivacyForRequest(params: {
  containsClientData: boolean;
  provider: AiProvider;
  env?: NodeJS.ProcessEnv;
}): ProviderPrivacyDecision {
  const env = params.env ?? process.env;
  const mode = getClientPiiPrivacyMode(env);

  if (!params.containsClientData) {
    return {
      ok: true,
      containsClientData: false,
      policyRequired: false,
      privacyPolicySatisfied: true,
      providerPolicyClass: "none",
      configState: "SAFE",
    };
  }

  if (mode === "off") {
    return {
      ok: true,
      containsClientData: true,
      policyRequired: false,
      privacyPolicySatisfied: true,
      providerPolicyClass: "none",
      configState: "UNSAFE",
    };
  }

  // Client PII + required policy.
  if (params.provider !== "openrouter") {
    return {
      ok: false,
      containsClientData: true,
      policyRequired: true,
      privacyPolicySatisfied: false,
      providerPolicyClass: "unavailable",
      configState: params.provider ? "UNSAFE" : "MISSING",
      errorCode: "AI_PRIVACY_POLICY_UNAVAILABLE",
      reason: "client_pii_requires_openrouter_zdr_policy",
    };
  }

  const openRouterProvider = buildOpenRouterClientPiiProviderPreferences(env);
  return {
    ok: true,
    containsClientData: true,
    policyRequired: true,
    privacyPolicySatisfied: true,
    providerPolicyClass: "openrouter_zdr_deny_collection",
    openRouterProvider,
    configState: "SAFE",
  };
}

/** Safe trace fields only — no PII, messages, or bodies. */
export function privacyDecisionTraceFields(
  decision: ProviderPrivacyDecision,
): {
  privacyPolicyRequired: boolean;
  privacyPolicySatisfied: boolean;
  providerPolicyClass: string;
  privacyConfigState: ProviderPrivacyConfigState;
} {
  return {
    privacyPolicyRequired: decision.policyRequired,
    privacyPolicySatisfied: decision.privacyPolicySatisfied,
    providerPolicyClass: decision.providerPolicyClass,
    privacyConfigState: decision.configState,
  };
}
