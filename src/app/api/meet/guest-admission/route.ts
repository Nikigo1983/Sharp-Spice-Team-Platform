import { NextResponse } from "next/server";
import { handleRequestGuestAdmission } from "@/lib/calendar/meeting-guest-admission-handler";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const inviteToken =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).inviteToken === "string"
      ? (body as Record<string, string>).inviteToken
      : "";
  const displayName =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).displayName
      : undefined;

  const result = await handleRequestGuestAdmission(inviteToken, displayName);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result, { status: 201 });
}
