import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { FinanceError } from "@/lib/finance/errors";
import { financeErrorResponse } from "@/lib/finance/http";
import { canManageFinance } from "@/lib/finance/permissions";
import { createOrSetContract } from "@/lib/finance/service";

type RouteContext = { params: Promise<{ id: string }> };

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
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      amount?: string | number;
      contractDate?: string;
    } | null;
    const finance = await createOrSetContract(session, decodeURIComponent(id), {
      amount: body?.amount ?? "",
      contractDate: String(body?.contractDate ?? ""),
    });
    return NextResponse.json({ finance });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
