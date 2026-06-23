import { NextResponse } from "next/server";
import {
  handleRecordMeetingAudit,
  parseMeetingAuditAction,
} from "@/lib/calendar/meeting-audit-handler";
import { getSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let action;
  try {
    const body = await request.json();
    action = parseMeetingAuditAction(body);
  } catch {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await handleRecordMeetingAudit(session, id, action);

  if ("status" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, auditId: result.audit.id }, { status: 201 });
}
