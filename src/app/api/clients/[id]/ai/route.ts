import { NextResponse } from "next/server";
import { runClientAi } from "@/lib/ai/client-assistant";
import { getSession } from "@/lib/auth/session";
import { getClientDetail } from "@/lib/google-sheets/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    message?: string;
    mode?: "chat" | "summary";
  };

  const detail = await getClientDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reply = await runClientAi(
    detail,
    body.message ?? "",
    body.mode ?? "chat",
  );

  return NextResponse.json({ reply });
}
