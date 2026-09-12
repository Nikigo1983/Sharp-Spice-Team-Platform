import { aiErrorCode, aiErrorMessage, aiErrorStatus } from "@/lib/ai/errors";
import { createAiDeadline, withAiRequestScope } from "@/lib/ai/request-scope";
export const runtime = "nodejs";
export const maxDuration = 180;
import { NextResponse } from "next/server";
import { runClientAi } from "@/lib/ai/client-assistant";
import { getSession } from "@/lib/auth/session";
import { getClientDetail } from "@/lib/google-sheets/service";

type RouteContext = { params: Promise<{ id: string }> };

async function handlePost(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    message?: string;
    mode?: "chat" | "summary";
  };

  const deadline = createAiDeadline(request.signal);
  try { return await withAiRequestScope(deadline.signal, async () => {
  deadline.signal.throwIfAborted();
  const detail = await getClientDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reply = await runClientAi(
    detail,
    body.message ?? "",
    body.mode ?? "chat",
  );

  deadline.signal.throwIfAborted();
  return NextResponse.json({ reply });
  }); } catch (error) {
    const code = aiErrorCode(deadline.signal.aborted ? deadline.signal.reason : error);
    return NextResponse.json({ error: code, reply: aiErrorMessage(code) }, { status: aiErrorStatus(code) });
  } finally { deadline.dispose(); }
}

export async function POST(request: Request, context: RouteContext) {
  try { return await handlePost(request, context); } catch (error) {
    const code = aiErrorCode(error);
    return NextResponse.json({ error: code, reply: aiErrorMessage(code) }, { status: aiErrorStatus(code) });
  }
}
