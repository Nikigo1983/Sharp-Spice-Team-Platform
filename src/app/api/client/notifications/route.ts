import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/client-portal/session";
import { listNotificationsForUser } from "@/lib/notifications/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "50");

  const allowed = new Set([
    "client_case_status",
    "client_agreement_update",
    "system",
  ]);

  const [polled, allRecent] = await Promise.all([
    listNotificationsForUser(session.id, {
      limit,
      since: since || undefined,
    }),
    listNotificationsForUser(session.id, {
      limit: 100,
    }),
  ]);

  const filtered = polled.filter((item) => allowed.has(item.type));
  const unread = allRecent.filter(
    (item) => allowed.has(item.type) && !item.is_read,
  ).length;

  return NextResponse.json(
    { notifications: filtered, unread },
    { headers: { "Cache-Control": "no-store" } },
  );
}
