import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { handleListGuestAdmissions } from "@/lib/calendar/meeting-guest-admission-handler";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const pendingOnly = new URL(request.url).searchParams.get("all") !== "true";
  const result = await handleListGuestAdmissions(session, id, { pendingOnly });

  if ("status" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
