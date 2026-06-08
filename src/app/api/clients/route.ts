import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listClients } from "@/lib/google-sheets/service";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize") ?? "25")),
  );

  const result = await listClients(page, pageSize, {
    search: searchParams.get("search") ?? undefined,
    direction: searchParams.get("direction") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    manager: searchParams.get("manager") ?? undefined,
    country: searchParams.get("country") ?? undefined,
  });

  return NextResponse.json(result);
}
