import { NextResponse } from "next/server";
import { handleGetGuestAdmissionStatus } from "@/lib/calendar/meeting-guest-admission-handler";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const inviteToken = new URL(request.url).searchParams.get("inviteToken") ?? "";

  const result = await handleGetGuestAdmissionStatus(id, inviteToken);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
