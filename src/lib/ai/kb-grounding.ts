import type { WorkspaceQueryIntent } from "@/lib/ai/query-intent";
import type {
  AiFallbackReason,
  DriveRetrievalMeta,
  KbGroundingState,
} from "@/lib/ai/workspace-trace";

export type KbGroundingDecision = {
  blockModel: boolean;
  reason: AiFallbackReason;
  reply: string | null;
  state: KbGroundingState;
};

export const KB_SAFE_GROUNDING_REPLY =
  "В базе знаний не нашлось достаточно информации, чтобы надёжно ответить на этот вопрос. Уточните тему, программу или название документа — либо откройте раздел Knowledge Base и укажите нужный файл.";

/**
 * Guard only when workspace intent already marked the question as needing
 * authoritative Knowledge Base information.
 */
export function decideKbGrounding(params: {
  intent: WorkspaceQueryIntent;
  kbMeta: DriveRetrievalMeta;
}): KbGroundingDecision {
  const { intent, kbMeta } = params;
  const state = kbMeta.groundingState;

  if (!intent.needsKb) {
    return {
      blockModel: false,
      reason: "NONE",
      reply: null,
      state: "KB_SKIPPED",
    };
  }

  if (state === "KB_CONTENT_AVAILABLE") {
    return {
      blockModel: false,
      reason: "NONE",
      reply: null,
      state,
    };
  }

  if (state === "KB_ERROR") {
    const reason: AiFallbackReason =
      kbMeta.mode === "unconfigured"
        ? "KB_NOT_CONFIGURED"
        : "KB_RETRIEVAL_ERROR";
    return {
      blockModel: true,
      reason,
      reply: KB_SAFE_GROUNDING_REPLY,
      state,
    };
  }

  if (state === "KB_EMPTY") {
    return {
      blockModel: true,
      reason: "KB_EMPTY",
      reply: KB_SAFE_GROUNDING_REPLY,
      state,
    };
  }

  if (state === "KB_CATALOG_ONLY" && intent.needsKbFullText) {
    return {
      blockModel: true,
      reason: "KB_CATALOG_ONLY_CONTENT_REQUIRED",
      reply: KB_SAFE_GROUNDING_REPLY,
      state,
    };
  }

  return {
    blockModel: false,
    reason: "NONE",
    reply: null,
    state,
  };
}

export function classifyKbGroundingState(params: {
  attempted: boolean;
  configured: boolean;
  mode: DriveRetrievalMeta["mode"];
  selectedFiles: DriveRetrievalMeta["selectedFiles"];
  contentRetrieved: boolean;
  usefulContextEmpty: boolean;
  failed?: boolean;
}): KbGroundingState {
  if (!params.attempted) return "KB_SKIPPED";
  if (params.failed || !params.configured || params.mode === "failed") {
    return "KB_ERROR";
  }
  if (params.mode === "unconfigured") return "KB_ERROR";
  if (params.mode === "catalog") {
    return params.selectedFiles.length > 0 ? "KB_CATALOG_ONLY" : "KB_EMPTY";
  }
  if (params.contentRetrieved && !params.usefulContextEmpty) {
    return "KB_CONTENT_AVAILABLE";
  }
  return "KB_EMPTY";
}
