import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getTaskForUser, removeTaskProgressReport } from "@/lib/tasks/store";

type RouteContext = { params: Promise<{ id: string; reportId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, reportId } = await context.params;
  const existing = await getTaskForUser(id, session);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const task = await removeTaskProgressReport(id, reportId, session);
  if (!task) {
    const report = existing.progressReports.find((item) => item.id === reportId);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ task });
}
