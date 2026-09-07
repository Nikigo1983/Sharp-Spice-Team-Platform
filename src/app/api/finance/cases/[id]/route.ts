import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { FinanceError } from "@/lib/finance/errors";
import { financeErrorResponse } from "@/lib/finance/http";
import { canViewFinance } from "@/lib/finance/permissions";
import { getClientFinance } from "@/lib/finance/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canViewFinance(session)) {
    return financeErrorResponse(
      new FinanceError("FINANCE_ACCESS_DENIED", "denied", 403),
    );
  }

  try {
    const { id } = await context.params;
    const finance = await getClientFinance(session, decodeURIComponent(id));
    return NextResponse.json({ finance });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
