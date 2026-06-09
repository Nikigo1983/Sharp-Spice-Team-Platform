import { NextResponse } from "next/server";
import { getClientsDiagnosticReport } from "@/lib/ai/clients-diagnostic";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await getClientsDiagnosticReport();
    return NextResponse.json(report);
  } catch (error) {
    console.error("[api/ai-workspace/clients-diagnostic]", error);
    return NextResponse.json(
      { error: "Не удалось выполнить диагностику таблиц." },
      { status: 500 },
    );
  }
}
