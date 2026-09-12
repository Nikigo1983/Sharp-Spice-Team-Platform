import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { processFormgridLeadsForNotifications } from "@/lib/notifications/formgrid-watch";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { filterActiveFormgridTable } from "@/lib/leads/formgrid-active-leads";
import {
  applyLeadReviewAction,
  LeadReviewActionError,
} from "@/lib/leads/lead-review-service";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const table = await getFormgridLeadsTable();
  await processFormgridLeadsForNotifications(table);
  const active = await filterActiveFormgridTable(table);
  return NextResponse.json(active);
}

/**
 * Soft-delete a Formgrid applicant from «Новые клиенты».
 * Marks the lead as rejected in platform review store (does not edit Google Sheet).
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string; sheetRow?: number };
  try {
    body = (await request.json()) as { action?: string; sheetRow?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "dismiss") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const sheetRow = Number(body.sheetRow);
  if (!Number.isFinite(sheetRow) || sheetRow < 2) {
    return NextResponse.json({ error: "Invalid sheetRow" }, { status: 400 });
  }

  try {
    const lead = await applyLeadReviewAction(
      Math.trunc(sheetRow),
      "reject",
      session.name ?? session.id,
    );
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      sheetRow: lead.sheetRow,
      status: lead.reviewStatus,
      name: lead.name,
    });
  } catch (error) {
    if (error instanceof LeadReviewActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[api/formgrid-leads] POST dismiss", error);
    return NextResponse.json(
      { error: "Не удалось удалить анкету из списка" },
      { status: 500 },
    );
  }
}
