import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { importImmigrationKnowledgeBase } from "@/lib/knowledge-base/import-immigration";

/** One-shot / idempotent import of Drive folder Immigration_Knowledge_Base. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "1";

  try {
    const result = await importImmigrationKnowledgeBase({ dryRun });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMPORT_FAILED";
    const status =
      message === "DRIVE_NOT_CONFIGURED" ||
      message === "DRIVE_AUTH_FAILED" ||
      message === "TARGET_FOLDER_NOT_FOUND"
        ? 400
        : 500;
    console.error("[knowledge-base] import immigration", error);
    return NextResponse.json({ error: message }, { status });
  }
}
