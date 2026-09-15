import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WORKSPACE_AI_PROMPT_VERSION,
  WORKSPACE_CANONICAL_CLIENT_SOURCE,
  workspaceCanonicalSourcePromptBlock,
} from "@/lib/ai/canonical-source-contract";
import { CLIENT_SEARCH_INTENT_SYSTEM_PROMPT } from "@/lib/ai/client-search-intent";
import { buildWorkspaceSystemPrompt } from "@/lib/ai/workspace-prompt";
import { WORKSPACE_ROUTER_SYSTEM_PROMPT } from "@/lib/ai/workspace-router";

describe("Phase 0 canonical ontology", () => {
  it("exposes portal questionnaire UUID contract", () => {
    assert.equal(WORKSPACE_CANONICAL_CLIENT_SOURCE.id, "client_portal");
    assert.equal(WORKSPACE_CANONICAL_CLIENT_SOURCE.clientId, "questionnaire_uuid");
    assert.ok(
      WORKSPACE_AI_PROMPT_VERSION.startsWith("phase0") ||
        WORKSPACE_AI_PROMPT_VERSION.startsWith("phase1"),
    );
    const block = workspaceCanonicalSourcePromptBlock();
    assert.match(block, /портала Emigrant/i);
  });

  it("workspace prompt no longer teaches Sheets as client SoT", () => {
    const prompt = buildWorkspaceSystemPrompt("brief");
    assert.match(prompt, /портала Emigrant/i);
    assert.match(prompt, /не канонический клиентский источник/i);
    assert.doesNotMatch(prompt, /CRM Google Sheets client records/i);
  });

  it("router prompt uses portal semantics", () => {
    assert.match(
      WORKSPACE_ROUTER_SYSTEM_PROMPT,
      /Emigrant client portal questionnaires/i,
    );
    assert.doesNotMatch(
      WORKSPACE_ROUTER_SYSTEM_PROMPT,
      /CRM Google Sheets client records/i,
    );
    assert.match(WORKSPACE_ROUTER_SYSTEM_PROMPT, /legacy route key only/i);
  });

  it("search-intent prompt uses portal DB", () => {
    assert.match(CLIENT_SEARCH_INTENT_SYSTEM_PROMPT, /portal questionnaires/i);
    assert.match(
      CLIENT_SEARCH_INTENT_SYSTEM_PROMPT,
      /Do not assume Google Sheets or Formgrid/i,
    );
    assert.doesNotMatch(
      CLIENT_SEARCH_INTENT_SYSTEM_PROMPT,
      /immigration CRM \(Google Sheets\)/i,
    );
  });
});
