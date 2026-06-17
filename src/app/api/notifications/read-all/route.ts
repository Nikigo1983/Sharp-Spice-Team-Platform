import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  deleteReadNotifications,
  markAllNotificationsRead,
} from "@/lib/notifications/store";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await markAllNotificationsRead(session.id);
  return NextResponse.json({ ok: true, count });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await deleteReadNotifications(session.id);
  return NextResponse.json({ ok: true, count });
}
