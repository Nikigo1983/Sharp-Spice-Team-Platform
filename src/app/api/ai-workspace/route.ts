import { NextResponse } from "next/server";
import {
  runWorkspaceAi,
  runWorkspaceAiStream,
  type WorkspaceChatTurn,
} from "@/lib/ai/workspace-assistant";
import {
  getWorkspaceAiConfig,
  isWorkspaceResponseMode,
} from "@/lib/ai/workspace-config";
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

  const body = (await request.json()) as {
    message?: string;
    history?: WorkspaceChatTurn[];
    mode?: string;
  };

  const mode = parseMode(body.mode);
  const message = body.message ?? "";
  const history = body.history ?? [];
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
                  sources: chunk.sources,
                  demo: chunk.demo,
                })}\n\n`,
              ),
            );
          }

          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
        } catch (error) {
          console.error("[api/ai-workspace] stream", error);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
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
      },
    });
  }

  try {
    const result = await runWorkspaceAi(message, history, mode);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/ai-workspace]", error);
    return NextResponse.json(
      {
        reply:
          "Внутренняя ошибка при обработке запроса. Перезапустите сервер и попробуйте снова.",
        sources: [],
        demo: true,
      },
      { status: 200 },
    );
  }
}
