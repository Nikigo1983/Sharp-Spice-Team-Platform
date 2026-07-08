import { NextResponse } from "next/server";
import { handleMintGuestMeetingToken } from "@/lib/calendar/meeting-guest-handler";

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
  const admissionId =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).admissionId === "string"
      ? (body as Record<string, string>).admissionId
      : undefined;
  const guestId =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).guestId === "string"
      ? (body as Record<string, string>).guestId
      : undefined;
  const accessPassword =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).accessPassword === "string"
      ? (body as Record<string, string>).accessPassword
      : undefined;

  const result = await handleMintGuestMeetingToken(inviteToken, displayName, {
    admissionId,
    guestId,
    accessPassword,
  });

  if ("status" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
