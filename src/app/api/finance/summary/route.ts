import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { FinanceError } from "@/lib/finance/errors";
import { financeErrorResponse } from "@/lib/finance/http";
import { canViewFinance } from "@/lib/finance/permissions";
import { getFinanceSummary } from "@/lib/finance/service";

export async function GET() {
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
    const summary = await getFinanceSummary(session);
    return NextResponse.json({ summary });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
