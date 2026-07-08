import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { handleGetOrCreateGuestInvite } from "@/lib/calendar/meeting-guest-invite-handler";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await handleGetOrCreateGuestInvite(session, id);

  if ("status" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
