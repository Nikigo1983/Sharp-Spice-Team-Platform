import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GPT6_ASTRA_MODEL_ID,
  getAuxiliaryLlmModel,
  getOpenRouterDefaultModel,
  getWorkspaceFinalModel,
  getWorkspaceRouterModelId,
  isGpt6AstraModel,
} from "@/lib/ai/models";
import { getWorkspaceAiConfig } from "@/lib/ai/workspace-config";
import { getWorkspaceRouterModel } from "@/lib/ai/workspace-router";

describe("GPT-6 Astra model resolution", () => {
  it("defaults resolve to openai/gpt-6-astra when env unset for that key", () => {
    const prev = {
      w: process.env.AI_WORKSPACE_MODEL,
      r: process.env.AI_WORKSPACE_ROUTER_MODEL,
      o: process.env.OPENROUTER_MODEL,
    };
    try {
      delete process.env.AI_WORKSPACE_MODEL;
      delete process.env.AI_WORKSPACE_ROUTER_MODEL;
      delete process.env.OPENROUTER_MODEL;
      assert.equal(getWorkspaceFinalModel(), GPT6_ASTRA_MODEL_ID);
      assert.equal(getWorkspaceRouterModelId(), GPT6_ASTRA_MODEL_ID);
      assert.equal(getOpenRouterDefaultModel(), GPT6_ASTRA_MODEL_ID);
      assert.equal(getAuxiliaryLlmModel(), GPT6_ASTRA_MODEL_ID);
      assert.equal(getWorkspaceAiConfig().model, GPT6_ASTRA_MODEL_ID);
      assert.equal(getWorkspaceRouterModel(), GPT6_ASTRA_MODEL_ID);
      assert.equal(isGpt6AstraModel(GPT6_ASTRA_MODEL_ID), true);
      assert.equal(isGpt6AstraModel("anthropic/claude-sonnet-4"), false);
    } finally {
      if (prev.w !== undefined) process.env.AI_WORKSPACE_MODEL = prev.w;
      else delete process.env.AI_WORKSPACE_MODEL;
      if (prev.r !== undefined) process.env.AI_WORKSPACE_ROUTER_MODEL = prev.r;
      else delete process.env.AI_WORKSPACE_ROUTER_MODEL;
      if (prev.o !== undefined) process.env.OPENROUTER_MODEL = prev.o;
      else delete process.env.OPENROUTER_MODEL;
    }
  });

  it("explicit env overrides are respected independently", () => {
    const prev = {
      w: process.env.AI_WORKSPACE_MODEL,
      r: process.env.AI_WORKSPACE_ROUTER_MODEL,
      o: process.env.OPENROUTER_MODEL,
    };
    try {
      process.env.AI_WORKSPACE_MODEL = "openai/gpt-6-astra";
      process.env.AI_WORKSPACE_ROUTER_MODEL = "openai/gpt-6-astra";
      process.env.OPENROUTER_MODEL = "openai/gpt-6-astra";
      assert.equal(getWorkspaceFinalModel(), "openai/gpt-6-astra");
      assert.equal(getWorkspaceRouterModelId(), "openai/gpt-6-astra");
      assert.equal(getOpenRouterDefaultModel(), "openai/gpt-6-astra");
    } finally {
      if (prev.w !== undefined) process.env.AI_WORKSPACE_MODEL = prev.w;
      else delete process.env.AI_WORKSPACE_MODEL;
      if (prev.r !== undefined) process.env.AI_WORKSPACE_ROUTER_MODEL = prev.r;
      else delete process.env.AI_WORKSPACE_ROUTER_MODEL;
      if (prev.o !== undefined) process.env.OPENROUTER_MODEL = prev.o;
      else delete process.env.OPENROUTER_MODEL;
    }
  });
});
