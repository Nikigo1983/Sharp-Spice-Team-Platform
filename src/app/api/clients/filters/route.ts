import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getFilterOptions } from "@/lib/google-sheets/service";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const options = await getFilterOptions();
  return NextResponse.json(options);
}
