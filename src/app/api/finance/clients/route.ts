import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import type { FinancePaymentStatus } from "@/lib/finance/calculations";
import { FinanceError } from "@/lib/finance/errors";
import { financeErrorResponse } from "@/lib/finance/http";
import { canViewFinance } from "@/lib/finance/permissions";
import { listFinanceClients } from "@/lib/finance/service";

export async function GET(request: Request) {
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
    const { searchParams } = new URL(request.url);
    const result = await listFinanceClients(session, {
      search: searchParams.get("search") ?? undefined,
      direction: searchParams.get("direction") ?? undefined,
      paymentStatus:
        (searchParams.get("paymentStatus") as
          | FinancePaymentStatus
          | "all"
          | null) ?? "all",
      page: Number(searchParams.get("page") ?? "1"),
      limit: Number(searchParams.get("limit") ?? "20"),
      sort:
        (searchParams.get("sort") as
          | "name"
          | "balance"
          | "contractDate"
          | "lastPayment"
          | null) ?? "name",
    });
    return NextResponse.json(result);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
