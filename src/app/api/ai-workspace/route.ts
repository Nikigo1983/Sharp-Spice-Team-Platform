import { NextResponse } from "next/server";
import {
  runWorkspaceAi,
  runWorkspaceAiStream,
  type WorkspaceChatTurn,
} from "@/lib/ai/workspace-assistant";
import type { ClientContext } from "@/lib/ai/client-context";
import type { ClientListContinuationState } from "@/lib/ai/client-list-continuation";
import { sanitizeClientListContinuation } from "@/lib/ai/client-list-continuation";
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

export async function POST(request: Request) {
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
  };

  const mode = parseMode(body.mode);
  const message = body.message ?? "";
  const history = body.history ?? [];
  const pendingClientCandidates =
    sanitizeClientContextsForTransport(body.pendingClientCandidates) ?? null;
  const clientListContinuation = sanitizeClientListContinuation(
    body.clientListContinuation ?? null,
  );
  const { stream } = getWorkspaceAiConfig();

  if (stream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of runWorkspaceAiStream(
            message,
            history,
            mode,
            pendingClientCandidates,
            requestId,
            clientListContinuation,
          )) {
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
                  `event: status\ndata: ${JSON.stringify({ phase: chunk.status })}\n\n`,
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
                })}\n\n`,
              ),
            );
          }

          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
        } catch (error) {
          console.error(`[api/ai-workspace][${requestId}] stream`, error);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                requestId,
                message:
                  "Внутренняя ошибка при обработке запроса. Попробуйте снова.",
              })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
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

  try {
    const result = await runWorkspaceAi(
      message,
      history,
      mode,
      pendingClientCandidates,
      requestId,
      clientListContinuation,
    );
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
    console.error(`[api/ai-workspace][${requestId}]`, error);
    return NextResponse.json(
      {
        reply:
          "Внутренняя ошибка при обработке запроса. Перезапустите сервер и попробуйте снова.",
        sources: [],
        demo: true,
        requestId,
      },
      {
        status: 200,
        headers: {
          "X-AI-Request-Id": requestId,
        },
      },
    );
  }
}
