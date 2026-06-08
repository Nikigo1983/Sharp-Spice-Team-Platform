import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { addClientNote, getClientDetail } from "@/lib/google-sheets/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim();

  if (!text) {
    return NextResponse.json({ error: "Text required" }, { status: 400 });
  }

  const detail = await getClientDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ok = await addClientNote(id, session.name, text);
  if (!ok) {
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }

  const updated = await getClientDetail(id);
  return NextResponse.json({ notes: updated?.notes ?? [] });
}
