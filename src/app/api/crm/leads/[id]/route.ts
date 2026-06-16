import { NextResponse } from "next/server";
import {
  applyLeadReviewAction,
  getLeadReviewDetail,
  LeadReviewActionError,
} from "@/lib/leads/lead-review-service";
import type { LeadReviewAction } from "@/lib/leads/lead-review-types";
import { LEAD_REVIEW_STATUSES } from "@/lib/leads/lead-review-types";
import { getSession } from "@/lib/auth/session";

function parseSheetRow(id: string): number | null {
  const parsed = Number(id);
  if (!Number.isFinite(parsed) || parsed < 2) return null;
  return Math.trunc(parsed);
}

function parseAction(value: unknown): LeadReviewAction | null {
  if (value === "mark_reviewed") return "mark_reviewed";
  if (value === "mark_duplicate") return "mark_duplicate";
  if (value === "reject") return "reject";
  if (value === "create_in_crm") return "create_in_crm";
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const sheetRow = parseSheetRow(id);
  if (!sheetRow) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  try {
    const lead = await getLeadReviewDetail(sheetRow);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ lead, statuses: LEAD_REVIEW_STATUSES });
  } catch (error) {
    console.error("[api/crm/leads/[id]] GET", error);
    return NextResponse.json(
      { error: "Не удалось загрузить лид" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const sheetRow = parseSheetRow(id);
  if (!sheetRow) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const body = (await request.json()) as { action?: string };
  const action = parseAction(body.action);
  if (!action) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    const lead = await applyLeadReviewAction(
      sheetRow,
      action,
      session.name ?? session.id,
    );
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ lead });
  } catch (error) {
    if (error instanceof LeadReviewActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[api/crm/leads/[id]] PATCH", error);
    return NextResponse.json(
      { error: "Не удалось обновить статус лида" },
      { status: 500 },
    );
  }
}
