import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/client-portal/session";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications/store";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markAllNotificationsRead(session.id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const notification = await markNotificationRead(id, session.id);
  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ notification });
}
