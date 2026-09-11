/**
 * Knowledge Base search tool — wraps existing lexical retrieval.
 * Returns ranked snippets only (no full documents).
 */

import { getKnowledgeBaseTextForAi } from "@/lib/google-drive/kb-text";
import {
  extractMeaningfulKbTokens,
  snippetAroundStrongestMatch,
} from "@/lib/google-drive/kb-retrieval-core";
import {
  deepRedactToolPayload,
  truncateChars,
  wrapKbSnippetAsUntrusted,
} from "@/lib/ai/workspace-tools/security";
import { validateSearchKnowledgeBaseArgs } from "@/lib/ai/workspace-tools/schemas";
import type {
  WorkspaceToolContext,
  WorkspaceToolResult,
} from "@/lib/ai/workspace-tools/types";

const SNIPPET_MAX = 400;

function baseResult(
  started: number,
  partial: Partial<WorkspaceToolResult> &
    Pick<WorkspaceToolResult, "ok" | "errorCode" | "data">,
): Omit<WorkspaceToolResult, "toolCallId" | "cacheHit"> {
  const data = deepRedactToolPayload(partial.data);
  return {
    ok: partial.ok,
    tool: "search_knowledge_base",
    errorCode: partial.errorCode ?? null,
    errorMessage: partial.errorMessage ?? null,
    data,
    latencyMs: Date.now() - started,
    resultCount: partial.resultCount ?? null,
    outputChars: JSON.stringify(data ?? null).length,
    sourceTags: partial.sourceTags ?? ["KB"],
  };
}

function extractSnippetFromContextText(
  text: string,
  path: string,
  tokens: string[],
): string {
  const idx = text.indexOf(path);
  if (idx >= 0) {
    const window = text.slice(idx, idx + 1200);
    const snipped = snippetAroundStrongestMatch(window, tokens);
    return truncateChars(snipped || window, SNIPPET_MAX).text;
  }
  return truncateChars(snippetAroundStrongestMatch(text, tokens), SNIPPET_MAX)
    .text;
}

export async function executeSearchKnowledgeBase(
  rawArgs: unknown,
  _ctx: WorkspaceToolContext,
): Promise<Omit<WorkspaceToolResult, "toolCallId" | "cacheHit">> {
  const started = Date.now();
  const validated = validateSearchKnowledgeBaseArgs(rawArgs);
  if (!validated.ok) {
    return baseResult(started, {
      ok: false,
      errorCode: validated.errorCode,
      errorMessage: validated.message,
      data: { error: validated.message },
    });
  }

  const queryParts = [validated.value.query];
  if (validated.value.programHint) {
    queryParts.push(validated.value.programHint);
  }
  const query = queryParts.join(" ").trim();
  const tokens = extractMeaningfulKbTokens(query);

  try {
    const result = await getKnowledgeBaseTextForAi(query, {
      contentSearch: true,
      full: false,
    });

    if (!result.meta.configured) {
      return baseResult(started, {
        ok: false,
        errorCode: "SOURCE_UNAVAILABLE",
        errorMessage: "Knowledge Base is not configured",
        data: {
          hits: [],
          retrievalMode: "lexical",
          configured: false,
        },
        resultCount: 0,
      });
    }

    if (result.meta.mode === "failed") {
      return baseResult(started, {
        ok: false,
        errorCode: "SOURCE_UNAVAILABLE",
        errorMessage: result.meta.errorMessage ?? "KB retrieval failed",
        data: {
          hits: [],
          retrievalMode: "lexical",
          configured: true,
        },
        resultCount: 0,
      });
    }

    const selected = result.meta.selectedFiles.slice(0, validated.value.limit);
    if (selected.length === 0) {
      return baseResult(started, {
        ok: false,
        errorCode: "NOT_FOUND",
        errorMessage: "No KB documents matched",
        data: {
          hits: [],
          retrievalMode: "lexical" as const,
          configured: true,
        },
        resultCount: 0,
      });
    }

    const hits = selected.map((file) => {
      const rawSnippet = file.hasContent
        ? extractSnippetFromContextText(result.text, file.path, tokens)
        : "";
      const title = file.path.split("/").pop() || file.path;
      const snippet = rawSnippet
        ? wrapKbSnippetAsUntrusted({
            documentId: file.id,
            title,
            snippet: rawSnippet,
          })
        : "";
      return {
        documentId: file.id,
        title,
        path: file.path,
        source: "knowledge_base" as const,
        score: file.score,
        snippet,
        hasContent: file.hasContent,
        retrievalMode: "lexical" as const,
        untrusted: true,
      };
    });

    return baseResult(started, {
      ok: true,
      errorCode: null,
      errorMessage: null,
      data: {
        hits,
        retrievalMode: "lexical" as const,
        /** Future-compatible; Phase 1 is always lexical. */
        configured: true,
      },
      resultCount: hits.length,
      sourceTags: ["KB"],
    });
  } catch (error) {
    return baseResult(started, {
      ok: false,
      errorCode: "SOURCE_UNAVAILABLE",
      errorMessage:
        error instanceof Error ? error.message : "KB search failed",
      data: {
        hits: [],
        retrievalMode: "lexical",
        error: "SOURCE_UNAVAILABLE",
      },
      resultCount: 0,
    });
  }
}
