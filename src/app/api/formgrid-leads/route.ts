import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { processFormgridLeadsForNotifications } from "@/lib/notifications/formgrid-watch";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const table = await getFormgridLeadsTable();
  await processFormgridLeadsForNotifications(table);
  return NextResponse.json(table);
}
