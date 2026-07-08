import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { handleDecideGuestAdmission } from "@/lib/calendar/meeting-guest-admission-handler";

type RouteContext = { params: Promise<{ id: string; admissionId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const decision =
    body && typeof body === "object" && (body as Record<string, unknown>).decision === "reject"
      ? "reject"
      : "admit";

  const { id, admissionId } = await context.params;
  const result = await handleDecideGuestAdmission(
    session,
    id,
    admissionId,
    decision,
  );

  if ("status" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
