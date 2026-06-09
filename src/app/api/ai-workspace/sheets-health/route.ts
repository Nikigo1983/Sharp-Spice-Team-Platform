import { NextResponse } from "next/server";
import { getSheetsConnectionHealth } from "@/lib/ai/client-lookup";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const health = await getSheetsConnectionHealth();
    return NextResponse.json(health);
  } catch (error) {
    console.error("[api/ai-workspace/sheets-health]", error);
    return NextResponse.json(
      { error: "Не удалось проверить подключение таблиц." },
      { status: 500 },
    );
  }
}
