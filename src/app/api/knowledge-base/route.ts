import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listKnowledgeBaseFolder } from "@/lib/google-drive/kb-drive";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId") ?? undefined;

  const listing = await listKnowledgeBaseFolder(folderId);
  return NextResponse.json(listing);
}
