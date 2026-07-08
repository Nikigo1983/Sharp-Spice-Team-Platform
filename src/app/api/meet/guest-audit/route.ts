import { NextResponse } from "next/server";
import { handleRecordGuestMeetingAudit } from "@/lib/calendar/meeting-guest-handler";
import { parseMeetingAuditAction } from "@/lib/calendar/meeting-audit-handler";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const inviteToken = typeof record.inviteToken === "string" ? record.inviteToken : "";
  const guestId = typeof record.guestId === "string" ? record.guestId : "";
  const displayName = record.displayName;

  let action;
  try {
    action = parseMeetingAuditAction({ action: record.action });
  } catch {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const result = await handleRecordGuestMeetingAudit(
    inviteToken,
    guestId,
    displayName,
    action,
  );

  if ("status" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
