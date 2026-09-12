import { aiErrorCode, aiErrorMessage, aiErrorStatus } from "@/lib/ai/errors";
import { createAiDeadline, withAiRequestScope } from "@/lib/ai/request-scope";

export const runtime = "nodejs";
export const maxDuration = 180;
import { NextResponse } from "next/server";
import {
  runWorkspaceAi,
  runWorkspaceAiStream,
  type WorkspaceChatTurn,
} from "@/lib/ai/workspace-assistant";
import type { ClientContext } from "@/lib/ai/client-context";
import type { ClientListContinuationState } from "@/lib/ai/client-list-continuation";
import { sanitizeClientListContinuation } from "@/lib/ai/client-list-continuation";
import { sanitizeConversationSummary } from "@/lib/ai/workspace-conversation-memory";
import { sanitizeCaseMemory } from "@/lib/ai/workspace-case-memory";
import {
  sanitizeClientContextsForTransport,
} from "@/lib/ai/context-redaction";
import {
  getWorkspaceAiConfig,
  isWorkspaceResponseMode,
} from "@/lib/ai/workspace-config";
import { createAiRequestId } from "@/lib/ai/workspace-trace";
import { getSession } from "@/lib/auth/session";

function parseMode(value: unknown) {
  if (typeof value === "string" && isWorkspaceResponseMode(value)) {
    return value;
  }
  return "brief" as const;
}

async function handlePost(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = createAiRequestId();
  const body = (await request.json()) as {
    message?: string;
    history?: WorkspaceChatTurn[];
    mode?: string;
    pendingClientCandidates?: ClientContext[];
    clientListContinuation?: ClientListContinuationState | null;
    conversationSummary?: string | null;
    caseMemory?: unknown;
    chatId?: string | null;
  };

  const mode = parseMode(body.mode);
  const message = body.message ?? "";
  const history = body.history ?? [];
  const pendingClientCandidates =
    sanitizeClientContextsForTransport(body.pendingClientCandidates) ?? null;
  const clientListContinuation = sanitizeClientListContinuation(
    body.clientListContinuation ?? null,
  );
  const conversationSummary = sanitizeConversationSummary(
    body.conversationSummary ?? null,
  );
  const caseMemory = sanitizeCaseMemory(body.caseMemory ?? null);
  const chatId =
    typeof body.chatId === "string" && body.chatId.trim()
      ? body.chatId.trim()
      : null;
  // Always pass session identity so internal agent eligibility can be evaluated
  // even when conversation memory (chatId) is not attached yet.
  const memoryContext = {
    userId: session.id,
    chatId,
    email: session.email,
    role: session.role,
  };
  const { stream } = getWorkspaceAiConfig();

  if (stream) {
    const encoder = new TextEncoder();
    const disconnect = new AbortController();
    const deadline = createAiDeadline(AbortSignal.any([request.signal, disconnect.signal]));
    let cancelled = false;
    const readable = new ReadableStream({
      async start(controller) {
        return withAiRequestScope(deadline.signal, async () => {
        try {
          for await (const chunk of runWorkspaceAiStream(
            message,
            history,
            mode,
            pendingClientCandidates,
            requestId,
            clientListContinuation,
            conversationSummary,
            memoryContext,
            caseMemory,
          )) {
            deadline.signal.throwIfAborted();
            if (typeof chunk === "string") {
              controller.enqueue(
                encoder.encode(
                  `event: delta\ndata: ${JSON.stringify({ content: chunk })}\n\n`,
                ),
              );
              continue;
            }

            if ("status" in chunk) {
              controller.enqueue(
                encoder.encode(
                  `event: status\ndata: ${JSON.stringify({
                    phase: chunk.status,
                    tool: chunk.tool,
                    label: chunk.label,
                    ok: chunk.ok,
                    errorCode: chunk.errorCode,
                    resultCount: chunk.resultCount,
                  })}\n\n`,
                ),
              );
              continue;
            }

            controller.enqueue(
              encoder.encode(
                `event: meta\ndata: ${JSON.stringify({
                  requestId: chunk.requestId,
                  sources: chunk.sources,
                  demo: chunk.demo,
                  pendingClientCandidates: sanitizeClientContextsForTransport(
                    chunk.pendingClientCandidates,
                  ),
                  needsClientSelection: chunk.needsClientSelection,
                  clientListContinuation: chunk.clientListContinuation ?? null,
                  conversationSummary: chunk.conversationSummary ?? null,
                  summaryThroughMessageCount:
                    chunk.summaryThroughMessageCount ?? null,
                  caseMemory: chunk.caseMemory ?? null,
                })}\n\n`,
              ),
            );
          }

          deadline.signal.throwIfAborted();
          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
        } catch (error) {
          if (cancelled || request.signal.aborted) return;
          const code = aiErrorCode(deadline.signal.aborted ? deadline.signal.reason : error);
          console.error(`[api/ai-workspace][${requestId}] ${code}`);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                requestId,
                code,
                message: aiErrorMessage(code),
              })}\n\n`,
            ),
          );
        } finally {
          deadline.dispose();
          if (!cancelled) controller.close();
        }
        });
      },
      cancel() { cancelled = true; disconnect.abort(); deadline.dispose(); },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-AI-Request-Id": requestId,
      },
    });
  }

  const deadline = createAiDeadline(request.signal);
  try {
    const result = await withAiRequestScope(deadline.signal, () => runWorkspaceAi(
      message,
      history,
      mode,
      pendingClientCandidates,
      requestId,
      clientListContinuation,
      conversationSummary,
      memoryContext,
      caseMemory,
    ));
    deadline.signal.throwIfAborted();
    return NextResponse.json(
      {
        ...result,
        requestId: result.requestId,
        pendingClientCandidates: sanitizeClientContextsForTransport(
          result.pendingClientCandidates,
        ),
      },
      {
        headers: {
          "X-AI-Request-Id": result.requestId,
        },
      },
    );
  } catch (error) {
    const code = aiErrorCode(deadline.signal.aborted ? deadline.signal.reason : error);
    console.error(`[api/ai-workspace][${requestId}] ${code}`);
    return NextResponse.json({ error: code, reply: aiErrorMessage(code), requestId }, {
      status: aiErrorStatus(code), headers: { "X-AI-Request-Id": requestId },
    });
  } finally { deadline.dispose(); }
}

export async function POST(request: Request) {
  try { return await handlePost(request); } catch (error) {
    const code = aiErrorCode(error);
    return NextResponse.json({ error: code, reply: aiErrorMessage(code) }, { status: aiErrorStatus(code) });
  }
}
