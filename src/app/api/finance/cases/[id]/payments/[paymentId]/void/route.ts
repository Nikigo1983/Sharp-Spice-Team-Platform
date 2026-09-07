import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { FinanceError } from "@/lib/finance/errors";
import { financeErrorResponse } from "@/lib/finance/http";
import { canManageFinance } from "@/lib/finance/permissions";
import { voidPayment } from "@/lib/finance/service";

type RouteContext = {
  params: Promise<{ id: string; paymentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageFinance(session)) {
    return financeErrorResponse(
      new FinanceError("FINANCE_ACCESS_DENIED", "denied", 403),
    );
  }

  try {
    const { id, paymentId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      reason?: string;
    } | null;
    const finance = await voidPayment(
      session,
      decodeURIComponent(id),
      decodeURIComponent(paymentId),
      String(body?.reason ?? ""),
    );
    return NextResponse.json({ finance });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
