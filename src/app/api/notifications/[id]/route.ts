import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { markNotificationRead } from "@/lib/notifications/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const notification = await markNotificationRead(id, session.id);
  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ notification });
}
