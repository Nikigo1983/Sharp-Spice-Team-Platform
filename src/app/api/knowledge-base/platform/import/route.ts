import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { importCompanyDriveFolders } from "@/lib/knowledge-base/import-company-drive";
import { importImmigrationKnowledgeBase } from "@/lib/knowledge-base/import-immigration";

/**
 * Import Drive content into platform KB.
 * ?target=company — Демо документы / СПИОРА / ЭМИГРАНТ → company library
 * ?target=clients (default) — Immigration_Knowledge_Base → client library
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "1";
  const target = searchParams.get("target") === "company" ? "company" : "clients";

  try {
    const result =
      target === "company"
        ? await importCompanyDriveFolders({ dryRun })
        : await importImmigrationKnowledgeBase({ dryRun });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMPORT_FAILED";
    const status =
      message === "DRIVE_NOT_CONFIGURED" ||
      message === "DRIVE_AUTH_FAILED" ||
      message === "TARGET_FOLDER_NOT_FOUND" ||
      message === "TARGET_FOLDERS_NOT_FOUND"
        ? 400
        : 500;
    console.error("[knowledge-base] import", target, error);
    return NextResponse.json({ error: message }, { status });
  }
}
